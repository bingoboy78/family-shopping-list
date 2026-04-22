import React, { useState, useEffect } from 'react'
import { Plus, Trash2, Check, ShoppingBag } from 'lucide-react'
import { supabase } from './lib/supabase'

function App() {
  const [items, setItems] = useState([])
  const [newItemName, setNewItemName] = useState('')
  const [loading, setLoading] = useState(true)

  // Fetch initial items
  useEffect(() => {
    fetchItems()

    // Subscribe to real-time changes
    const channel = supabase
      .channel('shopping_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'shopping_items' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setItems(prev => [payload.new, ...prev])
          } else if (payload.eventType === 'UPDATE') {
            setItems(prev => prev.map(item => item.id === payload.new.id ? payload.new : item))
          } else if (payload.eventType === 'DELETE') {
            setItems(prev => prev.filter(item => item.id === payload.old.id))
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  async function fetchItems() {
    try {
      const { data, error } = await supabase
        .from('shopping_items')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setItems(data || [])
    } catch (err) {
      console.warn('Real-time sync may be disabled: Supabase not configured', err)
    } finally {
      setLoading(false)
    }
  }

  async function addItem(e) {
    if (e) e.preventDefault()
    if (!newItemName.trim()) return

    const newItem = {
      name: newItemName,
      is_completed: false,
    }

    // Optimistic UI update
    const tempId = Math.random().toString()
    setItems([{ ...newItem, id: tempId, loading: true }, ...items])
    setNewItemName('')

    try {
      const { data, error } = await supabase
        .from('shopping_items')
        .insert([newItem])
        .select()

      if (error) throw error
      // The real-time subscription will handle updating the list properly
    } catch (err) {
      // Rollback if error
      setItems(prev => prev.filter(i => i.id !== tempId))
      alert('Error adding item. Make sure your Supabase project is set up!')
    }
  }

  async function toggleItem(id, is_completed) {
    try {
      const { error } = await supabase
        .from('shopping_items')
        .update({ is_completed: !is_completed })
        .eq('id', id)

      if (error) throw error
    } catch (err) {
      // Local fallback for demo
      setItems(prev => prev.map(item =>
        item.id === id ? { ...item, is_completed: !is_completed } : item
      ))
    }
  }

  async function deleteItem(id) {
    try {
      const { error } = await supabase
        .from('shopping_items')
        .delete()
        .eq('id', id)

      if (error) throw error
    } catch (err) {
      setItems(prev => prev.filter(item => item.id !== id))
    }
  }

  return (
    <div className="app-container">
      <h1>Family Shopping</h1>

      <form onSubmit={addItem} className="input-group">
        <input
          type="text"
          placeholder="Add product..."
          value={newItemName}
          onChange={(e) => setNewItemName(e.target.value)}
        />
        <button type="submit" className="btn-add">
          <Plus size={24} />
        </button>
      </form>

      {loading ? (
        <div className="empty-state">Loading items...</div>
      ) : (
        <ul className="shopping-list">
          {items.map((item) => (
            <li key={item.id} className="list-item">
              <div
                className="item-content"
                onClick={() => toggleItem(item.id, item.is_completed)}
              >
                <div className={`checkbox ${item.is_completed ? 'checked' : ''}`}>
                  {item.is_completed && <Check size={14} color="white" />}
                </div>
                <span className={`item-name ${item.is_completed ? 'completed' : ''}`}>
                  {item.name}
                </span>
              </div>
              <button
                className="btn-delete"
                onClick={() => deleteItem(item.id)}
              >
                <Trash2 size={18} />
              </button>
            </li>
          ))}
          {items.length === 0 && (
            <div className="empty-state">
              <ShoppingBag size={48} style={{ marginBottom: '1rem', opacity: 0.3 }} />
              <p>Your list is empty. Start adding items!</p>
            </div>
          )}
        </ul>
      )}
    </div>
  )
}

export default App
