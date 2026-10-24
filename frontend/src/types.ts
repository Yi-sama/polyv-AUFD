export type WorkType = 'poster' | 'photo' | 'video';

export interface Highlight { title: string; seconds: number }

export interface Work {
  id: string;
  type: WorkType;
  title: string;
  subtitle: string;
  date: string;
  description: string;
  cover: string;
  images: string[];
  featured: boolean;
  videoId: string;
  isDemo: boolean;
  highlights: Highlight[];
}

export interface Profile {
  name: string;
  alias: string;
  title: string;
  tags: string[];
  bio: string;
  about: string;
  contact: string;
  avatar: string;
  cover: string;
  updatedAt: string;
}

export type Media = Record<string, { width: number; height: number }>;

export interface Creator {
  slug: string;
  channel: number;
  revision: number;
  isSample: boolean;
  profile: Profile;
  works: Work[];
  media: Media;
}

export interface Preview { workId: string; type: WorkType; cover: string; width: number; height: number }

export interface CreatorSummary {
  slug: string;
  channel: number;
  isSample: boolean;
  profile: Pick<Profile, 'name' | 'alias' | 'title' | 'tags' | 'avatar' | 'bio'>;
  worksCount: number;
  previews: Preview[];
  previewVideo: { workId: string; videoId: string; seconds: number; isDemo: boolean } | null;
}

export interface Session { slug: string; name: string }

export interface VideoItem {
  videoId: string; title: string; cover: string; duration: number; status: number;
  playable: boolean; encrypted: boolean | null; createdAt: string;
}
export interface VideoPage {
  items: VideoItem[]; page: number; pageSize: number; total: number; totalPages: number;
}
export interface PlaybackToken {
  videoId: string; token: string | null; required: boolean; expiresAt: number | null;
  reason: 'official-demo' | 'unencrypted' | 'encrypted';
}

export const workTypeLabels: Record<WorkType, string> = { poster: '海报', photo: '照片', video: '影像' };
