import { useState, useRef, useCallback } from 'react'
import { api } from '../../api/client'
import toast from 'react-hot-toast'

const YOUTUBE_RE = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)[\w-]+/

export default function UploadZone({ onSubmit }) {
  const [mode, setMode] = useState('file') // 'file' | 'youtube'
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [dragging, setDragging] = useState(false)
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef(null)

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) setFile(f)
  }, [])

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    setDragging(true)
  }, [])

  const handleFileChange = (e) => {
    setFile(e.target.files[0] || null)
  }

  const handleSubmit = async () => {
    setLoading(true)
    try {
      if (mode === 'youtube') {
        if (!YOUTUBE_RE.test(youtubeUrl)) {
          toast.error('Please enter a valid YouTube URL')
          return
        }
        const { data } = await api.addYouTubeLecture(youtubeUrl)
        onSubmit?.(data.lecture_id)
        toast.success('YouTube lecture queued!')
      } else {
        if (!file) {
          toast.error('Please select a file')
          return
        }
        const MAX = 200 * 1024 * 1024 // 200MB
        if (file.size > MAX) {
          toast.error('File too large (max 200MB)')
          return
        }
        const form = new FormData()
        form.append('file', file)
        form.append('title', file.name.replace(/\.[^/.]+$/, ''))
        const { data } = await api.uploadLecture(form)
        onSubmit?.(data.lecture_id)
        toast.success('Upload started!')
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Upload failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="surface-card rounded-xl border surface-border p-6 w-full max-w-xl transition-colors">
      <h2 className="text-lg font-semibold text-primary mb-4">Add a lecture</h2>

      {/* Mode tabs */}
      <div className="flex gap-1 surface-bg p-1 rounded-lg mb-5">
        {['file', 'youtube'].map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 text-sm py-1.5 rounded-md transition-all font-medium ${
              mode === m ? 'surface-card shadow-sm text-primary' : 'text-tertiary'
            }`}
          >
            {m === 'file' ? '📁 Audio/Video file' : '▶️ YouTube URL'}
          </button>
        ))}
      </div>

      {mode === 'file' ? (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={() => setDragging(false)}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center gap-3 cursor-pointer transition-all ${
            dragging
              ? 'border-brand-400 bg-brand-50 dark:bg-brand-900/20'
              : file
              ? 'border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-950/20'
              : 'surface-border hover:border-brand-300 dark:hover:border-brand-700 hover:surface-card-hover'
          }`}
        >
          <span className="text-4xl">{file ? '✅' : '🎙️'}</span>
          {file ? (
            <>
              <p className="text-sm font-medium text-primary text-center">{file.name}</p>
              <p className="text-xs text-tertiary">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-secondary">Drop audio or video here</p>
              <p className="text-xs text-tertiary">.mp3 · .mp4 · .wav · .m4a · .webm · max 200MB</p>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".mp3,.mp4,.wav,.m4a,.webm,.ogg"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <input
            type="url"
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            className="w-full surface-bg border surface-border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:focus:ring-brand-900 transition-all text-primary"
          />
          {youtubeUrl && !YOUTUBE_RE.test(youtubeUrl) && (
            <p className="text-xs text-red-500">Please enter a valid YouTube URL</p>
          )}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={loading || (mode === 'file' ? !file : !youtubeUrl)}
        className="mt-5 w-full bg-brand-600 text-white py-2.5 rounded-lg font-medium text-sm hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Uploading…
          </>
        ) : (
          'Build knowledge graph →'
        )}
      </button>
    </div>
  )
}
