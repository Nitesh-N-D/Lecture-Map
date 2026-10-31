import { useState, useRef, useCallback } from 'react'
import { api } from '../../api/client'
import Button from '../ui/Button'
import Icon from '../ui/Icon'
import toast from 'react-hot-toast'

const ALLOWED_EXTENSIONS = ['mp3', 'mp4', 'wav', 'm4a', 'webm', 'ogg', 'pdf']
const MAX_FILE_SIZE = 200 * 1024 * 1024

export default function UploadZone({ onSubmit }) {
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

  const handleSubmit = async () => {
    if (!file) {
      toast.error('Choose a file before continuing.')
      return
    }
    setLoading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('title', file.name.replace(/\.[^/.]+$/, ''))
      const { data } = await api.uploadLecture(form)
      onSubmit?.(data.lecture_id)
      toast.success('Upload started')
      setFile(null)
      if (inputRef.current) inputRef.current.value = ''
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Upload failed')
    } finally {
      setLoading(false)
    }
  }

  const uploadState = dragging
    ? 'border-brand-500 bg-brand-50'
    : file
      ? 'border-brand-400 bg-brand-50/60'
      : 'border-slate-300 bg-[var(--surface-card)] hover:border-brand-400 hover:bg-brand-50/50'

  return (
    <section className="card p-6 sm:p-7 w-full max-w-xl shadow-lift">
      <h2 className="text-2xl font-semibold text-primary">Add learning material</h2>
      <p className="text-sm text-secondary mt-1 mb-5">
        Upload an audio or video recording, or a PDF with selectable text.
      </p>
      <div
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          setSelectedFile(event.dataTransfer.files[0] || null)
        }}
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            inputRef.current?.click()
          }
        }}
        role="button"
        tabIndex={0}
        aria-label={file ? `Selected file ${file.name}. Press Enter to choose a different file` : 'Choose an audio, video or PDF file to upload'}
        className={`border-2 border-dashed rounded-2xl p-9 flex flex-col items-center gap-3 cursor-pointer transition-colors ${uploadState}`}
      >
        <span className="grid h-12 w-12 place-items-center rounded-full bg-brand-100 text-brand-700">
          <Icon name={file ? 'check' : 'upload'} size={22} />
        </span>
        {file ? (
          <>
            <p className="text-sm font-medium text-primary text-center break-all">{file.name}</p>
            <p className="text-xs text-tertiary">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-secondary">Drop a file here, or choose one</p>
            <p className="text-xs text-tertiary text-center">MP3, MP4, WAV, M4A, WEBM, OGG, or PDF. Maximum 200MB.</p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".mp3,.mp4,.wav,.m4a,.webm,.ogg,.pdf,audio/*,video/*,application/pdf"
          onChange={(event) => setSelectedFile(event.target.files[0] || null)}
          className="hidden"
          data-testid="upload-input"
          tabIndex={-1}
          aria-hidden="true"
        />
      </div>
      <Button onClick={handleSubmit} disabled={loading || !file} className="mt-5 w-full gap-2">
        {loading ? 'Uploading...' : 'Build study materials'}
      </Button>
    </section>
  )
}
