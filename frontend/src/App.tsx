import { useEffect } from 'react';
import { useLocation } from './router';
import { refreshSession } from './store';
import Guide from './pages/Guide';
import Channel from './pages/Channel';
import Tune from './pages/Tune';
import Auth from './pages/Auth';
import Studio from './pages/Studio';

export default function App() {
  const { path } = useLocation();
  useEffect(() => { void refreshSession(); }, []);
  useEffect(() => { if (path === '/' || path === '/tune') document.title = 'AUFD · 大咖作品频道'; }, [path]);

  if (path === '/') return <Guide />;
  if (path === '/tune') return <Tune />;
  if (path === '/login') return <Auth mode="login" key="login" />;
  if (path === '/join') return <Auth mode="join" key="join" />;
  if (path === '/studio') return <Studio />;
  const match = path.match(/^\/([a-z0-9-]{2,40})(?:\/w\/([a-zA-Z0-9_-]{1,60}))?\/?$/);
  if (match) return <Channel slug={match[1]} workId={match[2] ?? null} />;
  return <Channel slug="__missing__" workId={null} />;
}
