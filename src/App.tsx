import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Check, Trash2, ChevronDown, ShoppingCart, Users, LogOut, Mic, RefreshCw, Wifi, WifiOff } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from './supabase'
import { useSpeechInput, VOICE_LANGUAGES } from './useSpeechInput'

// ───── Types ─────
interface ShoppingItem {
  id: string
  name: string
  category: string
  is_bought: boolean
  quantity: string
  family_code: string
  created_at: string
}

// ───── Constants ─────
const CATEGORIES: { name: string; emoji: string }[] = [
  { name: 'Fruits & Veggies', emoji: '🥬' },
  { name: 'Dairy & Eggs', emoji: '🥛' },
  { name: 'Meat & Fish', emoji: '🥩' },
  { name: 'Bakery', emoji: '🍞' },
  { name: 'Pantry', emoji: '🫙' },
  { name: 'Drinks', emoji: '🥤' },
  { name: 'Household', emoji: '🧹' },
  { name: 'Other', emoji: '📦' },
]

const STORAGE_KEY_CODE = 'family_shopping_code'
const STORAGE_KEY_ITEMS = 'family_shopping_items'

// ───── Helpers ─────
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function saveToStorage(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value))
}

// ───── App ─────
export default function App() {
  const [items, setItems] = useState<ShoppingItem[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [newItemName, setNewItemName] = useState('')
  const [newItemQuantity, setNewItemQuantity] = useState('')
  const [newItemCategory, setNewItemCategory] = useState(CATEGORIES[0].name)
  const [familyCode, setFamilyCode] = useState(() => loadFromStorage<string>(STORAGE_KEY_CODE, ''))
  const [isJoined, setIsJoined] = useState(() => !!loadFromStorage<string>(STORAGE_KEY_CODE, ''))
  const [isConnected, setIsConnected] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [errorHeader, setErrorHeader] = useState<string | null>(null)
  const subscriptionRef = useRef<any>(null)

  // ── Voice input ──
  const handleVoiceResult = useCallback((text: string) => {
    setNewItemName(prev => prev ? prev + ' ' + text : text)
  }, [])
  const { isListening, isSupported: voiceSupported, voiceLang, setVoiceLang, toggleListening } = useSpeechInput(handleVoiceResult)

  // ── Supabase real-time subscription ──
  useEffect(() => {
    if (!isJoined || !familyCode) return

    // Try loading from Supabase first, fall back to localStorage
    const fetchItems = async () => {
      setIsRefreshing(true)
      try {
        const { data, error } = await supabase
          .from('items')
          .select('*')
          .eq('family_code', familyCode)
          .order('created_at', { ascending: false })

        if (!error && data) {
          const cleanedData = data.map((item: any) => ({
            ...item,
            family_code: item.family_code ? item.family_code.trim() : familyCode
          }))
          setItems(cleanedData as ShoppingItem[])
          saveToStorage(STORAGE_KEY_ITEMS + '_' + familyCode, cleanedData)
          setErrorHeader(null)
        } else if (error) {
          console.error('Fetch error:', error)
          setErrorHeader('Poor connection. Using local data.')
          setItems(loadFromStorage<ShoppingItem[]>(STORAGE_KEY_ITEMS + '_' + familyCode, []))
        }
      } catch (err) {
        console.error('Network error:', err)
        setErrorHeader('Offline. Using local data.')
        setItems(loadFromStorage<ShoppingItem[]>(STORAGE_KEY_ITEMS + '_' + familyCode, []))
      } finally {
        setIsRefreshing(false)
      }
    }

    fetchItems()

    // Subscribe to real-time changes
    const channel = supabase
      .channel('items-' + familyCode)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'items',
        filter: `family_code=eq.${familyCode}`,
      }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setItems(prev => {
            const exists = prev.some(i => i.id === (payload.new as ShoppingItem).id)
            if (exists) return prev
            const updated = [payload.new as ShoppingItem, ...prev]
            return updated
          })
        } else if (payload.eventType === 'UPDATE') {
          setItems(prev => prev.map(i => i.id === (payload.new as ShoppingItem).id ? payload.new as ShoppingItem : i))
        } else if (payload.eventType === 'DELETE') {
          setItems(prev => prev.filter(i => i.id !== (payload.old as { id: string }).id))
        }
      })
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED')
      })

    subscriptionRef.current = channel

    return () => {
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current)
      }
    }
  }, [isJoined, familyCode])

  const manualRefresh = useCallback(async () => {
    if (!familyCode) return
    setIsRefreshing(true)
    const { data, error } = await supabase
      .from('items')
      .select('*')
      .eq('family_code', familyCode)
      .order('created_at', { ascending: false })

    if (!error && data) {
      setItems(data as ShoppingItem[])
      setErrorHeader(null)
    } else {
      setErrorHeader('Update failed. Try again.')
    }
    setIsRefreshing(false)
  }, [familyCode])

  // ── Persist items locally on every change ──
  useEffect(() => {
    if (isJoined && familyCode) {
      saveToStorage(STORAGE_KEY_ITEMS + '_' + familyCode, items)
    }
  }, [items, isJoined, familyCode])

  // ── Actions ──
  const handleJoin = useCallback((code: string) => {
    if (!code.trim()) return
    const upper = code.trim().toUpperCase()
    setFamilyCode(upper)
    setIsJoined(true)
    saveToStorage(STORAGE_KEY_CODE, upper)
  }, [])

  const handleCreateNew = useCallback(() => {
    const code = 'FAMILY_' + Math.random().toString(36).slice(2, 6).toUpperCase()
    handleJoin(code)
  }, [handleJoin])

  const handleLogout = useCallback(() => {
    setIsJoined(false)
    setFamilyCode('')
    setItems([])
    localStorage.removeItem(STORAGE_KEY_CODE)
  }, [])

  const handleAddItem = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newItemName.trim()) return

    const item: ShoppingItem = {
      id: generateId(),
      name: newItemName.trim(),
      category: newItemCategory,
      is_bought: false,
      quantity: newItemQuantity.trim() || '1',
      family_code: familyCode,
      created_at: new Date().toISOString(),
    }

    // Optimistic update
    setItems(prev => [item, ...prev])
    setNewItemName('')
    setNewItemQuantity('')
    setIsModalOpen(false)

    // Try to persist to Supabase
    try {
      await supabase.from('items').insert(item)
    } catch {
      // Already saved locally via useEffect
    }
  }, [newItemName, newItemCategory, newItemQuantity, familyCode])

  const toggleBought = useCallback(async (id: string) => {
    setItems(prev => prev.map(item =>
      item.id === id ? { ...item, is_bought: !item.is_bought } : item
    ))

    try {
      const target = items.find(i => i.id === id)
      if (target) {
        await supabase.from('items').update({ is_bought: !target.is_bought }).eq('id', id)
      }
    } catch {
      // Already updated locally
    }
  }, [items])

  const deleteItem = useCallback(async (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id))

    try {
      await supabase.from('items').delete().eq('id', id)
    } catch {
      // Already removed locally
    }
  }, [])

  // ── Derived state ──
  const activeItems = items.filter(i => !i.is_bought)
  const boughtItems = items.filter(i => i.is_bought)

  const groupedActive = CATEGORIES.reduce((acc, cat) => {
    const catItems = activeItems.filter(i => i.category === cat.name)
    if (catItems.length > 0) acc.push({ ...cat, items: catItems })
    return acc
  }, [] as { name: string; emoji: string; items: ShoppingItem[] }[])

  // ════════════════════════════════════════════
  //  JOIN SCREEN
  // ════════════════════════════════════════════
  if (!isJoined) {
    return (
      <div className="container">
        <div className="join-screen">
          <motion.div
            className="join-card"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="join-icon">
              <ShoppingCart size={28} color="var(--primary)" />
            </div>
            <h1 className="join-title">Family Shopping</h1>
            <p className="join-subtitle">
              A shared shopping list for your whole family.<br />
              Add items — everyone sees them instantly.
            </p>

            <div className="form-group">
              <label className="form-label">Family Code</label>
              <input
                className="form-input join-input"
                type="text"
                placeholder="e.g. SMITHS"
                value={familyCode}
                onChange={e => setFamilyCode(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && handleJoin(familyCode)}
              />
            </div>
            <button className="btn-primary" onClick={() => handleJoin(familyCode)} disabled={!familyCode.trim()}>
              Join List
            </button>

            <div className="join-or">or</div>

            <button className="btn-secondary" onClick={handleCreateNew}>
              Create a new list
            </button>
          </motion.div>
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════════
  //  MAIN SHOPPING LIST
  // ════════════════════════════════════════════
  return (
    <div className="container">
      {/* Header */}
      <header>
        <div className="header-left">
          <ShoppingCart size={22} color="var(--primary)" />
          <span className="header-title">{familyCode}</span>
          <div className={`status-dot ${isConnected ? 'online' : 'offline'}`} title={isConnected ? 'Connected' : 'Connecting...'}>
            {isConnected ? <Wifi size={10} /> : <WifiOff size={10} />}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button 
            className={`refresh-btn ${isRefreshing ? 'spinning' : ''}`}
            onClick={manualRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw size={16} />
          </button>
          <div className="header-badge">
            <Users size={12} /> Family
          </div>
          <button
            onClick={handleLogout}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.25rem' }}
            title="Log out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Stats */}
      <div className="stats-bar">
        <div className="stat-chip">
          <span className="stat-value">{activeItems.length}</span>
          <span className="stat-label">To Buy</span>
        </div>
        <div className="stat-chip">
          <span className="stat-value">{boughtItems.length}</span>
          <span className="stat-label">Bought</span>
        </div>
        <div className="stat-chip">
          <span className="stat-value">{items.length}</span>
          <span className="stat-label">Total</span>
        </div>
      </div>

      {errorHeader && (
        <div className="error-banner">
          <WifiOff size={14} /> {errorHeader}
        </div>
      )}

      {/* Active Items by Category */}
      <main>
        <AnimatePresence mode="popLayout">
          {groupedActive.map(group => (
            <div key={group.name} className="category-group">
              <div className="category-header">
                <span className="category-emoji">{group.emoji}</span>
                <span className="category-title">{group.name}</span>
                <span className="category-count">{group.items.length}</span>
              </div>
              {group.items.map(item => (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -40, transition: { duration: 0.2 } }}
                  className="item-card"
                >
                  <div
                    className={`checkbox ${item.is_bought ? 'checked' : ''}`}
                    onClick={() => toggleBought(item.id)}
                  >
                    {item.is_bought && <Check size={12} strokeWidth={3} />}
                  </div>
                  <div className="item-content" onClick={() => toggleBought(item.id)}>
                    <div className={`item-name ${item.is_bought ? 'bought' : ''}`}>
                      {item.name}
                    </div>
                    {item.quantity && item.quantity !== '1' && (
                      <div className="item-quantity">{item.quantity}</div>
                    )}
                  </div>
                  <button className="delete-btn" onClick={() => deleteItem(item.id)}>
                    <Trash2 size={16} />
                  </button>
                </motion.div>
              ))}
            </div>
          ))}
        </AnimatePresence>

        {/* Bought items collapsed */}
        {boughtItems.length > 0 && (
          <div className="category-group" style={{ opacity: 0.5 }}>
            <div className="category-header">
              <span className="category-emoji">✅</span>
              <span className="category-title">Bought</span>
              <span className="category-count">{boughtItems.length}</span>
            </div>
            {boughtItems.map(item => (
              <motion.div
                key={item.id}
                layout
                className="item-card bought"
              >
                <div
                  className="checkbox checked"
                  onClick={() => toggleBought(item.id)}
                >
                  <Check size={12} strokeWidth={3} />
                </div>
                <div className="item-content" onClick={() => toggleBought(item.id)}>
                  <div className="item-name bought">{item.name}</div>
                </div>
                <button className="delete-btn" onClick={() => deleteItem(item.id)}>
                  <Trash2 size={16} />
                </button>
              </motion.div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {items.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">🛒</div>
            <p className="empty-title">Your list is empty</p>
            <p className="empty-text">Tap + to add items</p>
          </div>
        )}
      </main>

      {/* FAB */}
      <motion.button
        className="fab"
        onClick={() => setIsModalOpen(true)}
        whileTap={{ scale: 0.9 }}
      >
        <Plus size={24} />
      </motion.button>

      {/* Add Item Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsModalOpen(false)}
          >
            <motion.div
              className="modal-sheet"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="modal-handle" />
              <h3 className="modal-title">Add Item</h3>
              <form onSubmit={handleAddItem}>
                <div className="form-group">
                  <label className="form-label">Name</label>
                  <div className="voice-input-row">
                    <input
                      className="form-input"
                      autoFocus
                      placeholder="e.g. Bananas"
                      value={newItemName}
                      onChange={e => setNewItemName(e.target.value)}
                      style={{ marginBottom: 0 }}
                    />
                    {voiceSupported && (
                      <button
                        type="button"
                        className={`voice-btn ${isListening ? 'listening' : ''}`}
                        onClick={toggleListening}
                        title={isListening ? 'Stop listening' : 'Voice input'}
                      >
                        <Mic size={18} />
                      </button>
                    )}
                  </div>
                  {voiceSupported && (
                    <div className="voice-lang-row">
                      {VOICE_LANGUAGES.map(lang => (
                        <button
                          key={lang.code}
                          type="button"
                          className={`voice-lang-btn ${voiceLang.code === lang.code ? 'active' : ''}`}
                          onClick={() => setVoiceLang(lang)}
                        >
                          {lang.flag} {lang.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="form-group">
                  <label className="form-label">Quantity</label>
                  <input
                    className="form-input"
                    placeholder="e.g. 1 kg, 2 pcs"
                    value={newItemQuantity}
                    onChange={e => setNewItemQuantity(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Category</label>
                  <div className="select-wrapper">
                    <select
                      className="form-select"
                      value={newItemCategory}
                      onChange={e => setNewItemCategory(e.target.value)}
                    >
                      {CATEGORIES.map(cat => (
                        <option key={cat.name} value={cat.name}>
                          {cat.emoji} {cat.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={16} />
                  </div>
                </div>
                <button type="submit" className="btn-primary" disabled={!newItemName.trim()}>
                  Add to List
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
