// 与 docs/api.md 保持一致，字段变更需双方确认
export type WorkType = 'poster' | 'photo' | 'video'

export interface Highlight {
  title: string
  seconds: number
}

export interface Work {
  id: string
  type: WorkType
  title: string
  subtitle: string
  date: string
  description: string
  cover: string
  images: string[]
  featured: boolean
  videoId: string
  isDemo: boolean
  highlights: Highlight[]
}

export interface Profile {
  name: string
  alias: string
  role: string
  bio: string
  about: string
  email: string
  avatar: string
  updatedAt: string
}

export interface MediaSize {
  width: number
  height: number
}

export interface Creator {
  slug: string
  revision: number
  profile: Profile
  works: Work[]
  media: Record<string, MediaSize>
}

export const TYPE_LABEL: Record<WorkType, string> = {
  poster: '海报',
  photo: '照片',
  video: '影像',
}
