import { useState, useRef, useCallback } from 'react'
import { api } from '../../api/client'
import toast from 'react-hot-toast'

const YOUTUBE_RE = /^(https?:\/\/)?(www\.)?(m\.)?(youtube\.com\/(watch\?.*v=|shorts\/|embed\/)|youtu\.be\/)[\w-]+/i
const ALLOWED_EXTENSIONS = ['mp3', 'mp4', 'wav', 'm4a', 'webm', 'ogg']
const MAX_FILE_SIZE = 200 * 1024 * 1024

export default function UploadZone({ onSubmit }) {
  const [mode, setMode] = useState('file')
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [dragging, setDragging] = useState(false)
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef(null)

  const setSelectedFile = useCallback((nextFile) => {
    if (!nextFile) {
      setFile(null)
      return
    }

    const extension = nextFile.name.split('.').pop()?.toLowerCase()
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      toast.error(`Unsupported file type. Use ${ALLOWED_EXTENSIONS.join(', ')}.`)
      setFile(null)
      return
    }

    if (nextFile.size > MAX_FILE_SIZE) {
      toast.error('File too large. Maximum size is 200MB.')
      setFile(null)
      return
    }

    setFile(nextFile)
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    setSelectedFile(e.dataTransfer.files[0] || null)
  }, [setSelectedFile])

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    setDragging(true)
  }, [])

  const handleFileChange = (e) => {
    setSelectedFile(e.target.files[0] || null)
  }

  const handleSubmit = async () => {
    setLoading(true)
    try {
      if (mode === 'youtube') {
        const trimmedUrl = youtubeUrl.trim()
        if (!YOUTUBE_RE.test(trimmedUrl)) {
          toast.error('Please enter a valid YouTube URL')
          return
        }

        const { data } = await api.addYouTubeLecture(trimmedUrl)
        onSubmit?.(data.lecture_id)
        toast.success('YouTube lecture queued')
        setYoutubeUrl('')
      } else {
        if (!file) {
          toast.error('Please select a file')
          return
        }

        const form = new FormData()
        form.append('file', file)
        form.append('title', file.name.replace(/\.[^/.]+$/, ''))
        const { data } = await api.uploadLecture(form)
        onSubmit?.(data.lecture_id)
        toast.success('Upload started')
        setFile(null)
        if (inputRef.current) inputRef.current.value = ''
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Upload failed')
    } finally {
      setLoading(false)
    }
  }

  const uploadState = dragging
    ? 'border-brand-400 bg-brand-50'
    : file
      ? 'border-green-300 bg-green-50'
      : 'surface-border hover:border-brand-300 hover:bg-slate-50'

  return (
    <div className="surface-card rounded-xl border surface-border p-6 w-full max-w-xl transition-colors shadow-sm">
      <h2 className="text-lg font-semibold text-primary mb-1">Add a lecture</h2>
      <p className="text-sm text-secondary mb-5">
        Upload audio or paste a YouTube link to start building your graph.
      </p>

      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg mb-5">
        {['file', 'youtube'].map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`flex-1 text-sm py-1.5 rounded-md transition-all font-medium ${
              mode === m ? 'bg-white shadow-sm text-primary' : 'text-secondary hover:text-primary'
            }`}
          >
            {m === 'file' ? 'Audio/video file' : 'YouTube URL'}
          </button>
        ))}
      </div>

      {mode === 'file' ? (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={() => setDragging(false)}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center gap-3 cursor-pointer transition-all ${uploadState}`}
        >
          <span className="text-2xl font-semibold text-brand-600">{file ? 'OK' : '+'}</span>
          {file ? (
            <>
              <p className="text-sm font-medium text-primary text-center">{file.name}</p>
              <p className="text-xs text-tertiary">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-secondary">Drop audio or video here</p>
              <p className="text-xs text-tertiary text-center">
                MP3, MP4, WAV, M4A, WEBM, OGG. Max 200MB.
              </p>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".mp3,.mp4,.wav,.m4a,.webm,.ogg,audio/*,video/*"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-secondary" htmlFor="youtube-url">
            YouTube URL
          </label>
          <input
            id="youtube-url"
            type="url"
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            className="w-full bg-white border surface-border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-all text-primary"
          />
          {youtubeUrl && !YOUTUBE_RE.test(youtubeUrl.trim()) && (
            <p className="text-xs text-red-500">Please enter a valid YouTube URL</p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={loading || (mode === 'file' ? !file : !youtubeUrl.trim())}
        className="mt-5 w-full bg-brand-600 text-white py-2.5 rounded-lg font-medium text-sm hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Uploading...
          </>
        ) : (
          'Build knowledge graph'
        )}
      </button>
    </div>
  )
}
