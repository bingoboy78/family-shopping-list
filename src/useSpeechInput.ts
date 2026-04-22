import { useState, useCallback, useRef, useEffect } from 'react'

// ───── Types ─────
export interface VoiceLang {
    code: string
    label: string
    flag: string
}

export const VOICE_LANGUAGES: VoiceLang[] = [
    { code: 'en-US', label: 'English', flag: '🇺🇸' },
    { code: 'he-IL', label: 'עברית', flag: '🇮🇱' },
    { code: 'ru-RU', label: 'Русский', flag: '🇷🇺' },
]

// ───── SpeechRecognition type shim ─────
interface SpeechRecognitionEvent {
    resultIndex: number
    results: SpeechRecognitionResultList
}

interface SpeechRecognitionErrorEvent {
    error: string
}

type SpeechRecognitionInstance = {
    lang: string
    interimResults: boolean
    continuous: boolean
    maxAlternatives: number
    start(): void
    stop(): void
    abort(): void
    onresult: ((event: SpeechRecognitionEvent) => void) | null
    onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
    onend: (() => void) | null
    onstart: (() => void) | null
}

function getSpeechRecognition(): (new () => SpeechRecognitionInstance) | null {
    const w = window as unknown as Record<string, unknown>
    return (w.SpeechRecognition || w.webkitSpeechRecognition) as (new () => SpeechRecognitionInstance) | null
}

// ───── Hook ─────
export function useSpeechInput(onResult: (text: string) => void) {
    const [isListening, setIsListening] = useState(false)
    const [voiceLang, setVoiceLang] = useState<VoiceLang>(VOICE_LANGUAGES[0])
    const [isSupported, setIsSupported] = useState(false)
    const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)

    useEffect(() => {
        setIsSupported(!!getSpeechRecognition())
    }, [])

    const startListening = useCallback(() => {
        const SpeechRecognitionCtor = getSpeechRecognition()
        if (!SpeechRecognitionCtor) return

        // Stop any existing recognition
        if (recognitionRef.current) {
            recognitionRef.current.abort()
        }

        const recognition = new SpeechRecognitionCtor()
        recognition.lang = voiceLang.code
        recognition.interimResults = false
        recognition.continuous = false
        recognition.maxAlternatives = 1

        recognition.onstart = () => {
            setIsListening(true)
        }

        recognition.onresult = (event: SpeechRecognitionEvent) => {
            const transcript = event.results[event.resultIndex][0].transcript
            if (transcript) {
                onResult(transcript.trim())
            }
        }

        recognition.onerror = () => {
            setIsListening(false)
        }

        recognition.onend = () => {
            setIsListening(false)
            recognitionRef.current = null
        }

        recognitionRef.current = recognition
        recognition.start()
    }, [voiceLang, onResult])

    const stopListening = useCallback(() => {
        if (recognitionRef.current) {
            recognitionRef.current.stop()
        }
    }, [])

    const toggleListening = useCallback(() => {
        if (isListening) {
            stopListening()
        } else {
            startListening()
        }
    }, [isListening, startListening, stopListening])

    return {
        isListening,
        isSupported,
        voiceLang,
        setVoiceLang,
        toggleListening,
    }
}
