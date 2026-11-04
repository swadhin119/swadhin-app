export interface ProviderInfo { value: string; name: string; version: string; icon?: string; type?: string }
export interface Post { title: string; link: string; image: string; provider?: string; rating?: number }
export interface Catalog { title: string; filter: string }
export interface DirectLink { title: string; link: string; type?: "movie" | "series" }
export interface LinkItem { title: string; quality?: string; episodesLink?: string; directLinks?: DirectLink[] }
export interface Info {
  title: string; image: string; poster?: string; synopsis: string; type: string; rating?: string;
  tags?: string[]; cast?: string[]; imdbId?: string; webUrl?: string; linkList: LinkItem[];
}
export interface EpisodeLink { title: string; link: string; image?: string; description?: string }
export interface SubtitleTrack { title: string; language?: string; type?: string; uri: string }
export interface RawStream {
  server: string; link: string; type?: string; quality?: string;
  subtitles?: SubtitleTrack[]; headers?: Record<string, string>;
}
export type StreamKind = "hls" | "mp4" | "mkv" | "embed" | "other";
export interface Stream {
  id: string; server: string; quality?: string; link: string; kind: StreamKind;
  headers: Record<string, string>; subtitles: SubtitleTrack[];
}
