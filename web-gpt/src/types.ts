export interface Work {
  id: string;
  type: 'poster' | 'photo' | 'video';
  title: string;
  subtitle: string;
  date: string;
  description: string;
  cover: string;
  images: string[];
  featured: boolean;
  videoId: string;
  isDemo: boolean;
  highlights: { title: string; seconds: number }[];
}
export interface Portfolio {
  slug: string;
  revision: number;
  profile: {
    name: string; alias: string; role: string; bio: string; about: string;
    email: string; cover: string; avatar: string; updatedAt: string;
  };
  works: Work[];
  media: Record<string, { width: number; height: number }>;
}
export interface Health { status: string; readOnly: boolean; polyvConfigured: boolean }
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
export const workTypeLabels: Record<Work['type'], string> = { poster: '海报', photo: '照片', video: '影像' };
