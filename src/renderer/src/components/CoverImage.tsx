import { useEffect, useState } from 'react'
import { Gamepad2, ImageIcon } from 'lucide-react'

interface CoverImageProps {
  imagePath: string
  alt: string
  variant?: 'card' | 'modal'
}

function CoverImage({ imagePath, alt, variant = 'card' }: CoverImageProps) {
  const [src, setSrc] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setSrc(null)
    setLoaded(false)
    setError(null)

    window.api.invoke('image:read', { imagePath })
      .then((url) => {
        if (url) {
          setSrc(url)
        } else {
          setError('No data')
        }
      })
      .catch((err) => setError(String(err)))
  }, [imagePath])

  if (variant === 'modal') {
    if (error) {
      return (
        <div className="flex flex-col items-center justify-center w-full h-full">
          <ImageIcon className="h-6 w-6 text-muted-foreground" />
          <span className="text-xs text-red-500 mt-1">{error}</span>
        </div>
      )
    }
    if (!src) {
      return <ImageIcon className="h-8 w-8 text-muted-foreground" />
    }
    return <img src={src} alt={alt} className="w-full h-full object-cover" />
  }

  // Card variant
  if (!src && !error) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-muted">
        <span className="text-xs text-muted-foreground">Loading...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted">
        <Gamepad2 className="h-8 w-8 text-muted-foreground" />
        <span className="text-xs text-red-500 mt-1">{error}</span>
      </div>
    )
  }

  return (
    <>
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted">
          <span className="text-xs text-muted-foreground">Rendering...</span>
        </div>
      )}
      <img
        src={src!}
        alt={alt}
        className={`absolute inset-0 w-full h-full object-cover ${loaded ? '' : 'opacity-0'}`}
        onLoad={() => setLoaded(true)}
        onError={() => setError('Failed to load')}
      />
    </>
  )
}

export default CoverImage
