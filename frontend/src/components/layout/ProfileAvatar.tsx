import { useState } from 'react'

export function ProfileAvatar({ name, imageUrl }: { name: string; imageUrl?: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const initials = name.trim().split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div className="w-9 h-9 rounded-full overflow-hidden bg-[#ebd8a8] border border-[#a9874e]/30 flex items-center justify-center font-semibold text-xs text-[#745723] shrink-0">
      {imageUrl && imageUrl !== failedUrl
        ? <img src={imageUrl} alt={`${name}'s profile photo`} className="w-full h-full object-cover" referrerPolicy="no-referrer" onError={() => setFailedUrl(imageUrl)} />
        : <span aria-label={`${name}'s initials`}>{initials}</span>}
    </div>
  )
}
