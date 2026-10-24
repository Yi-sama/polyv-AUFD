import { useState } from 'react';
import type { FormEvent } from 'react';
import { LoaderCircle } from 'lucide-react';
import { join, login } from '../api';
import { Link, navigate } from '../router';
import { invalidate, setSession } from '../store';
import { Masthead } from '../ui';

export default function Auth({ mode }: { mode: 'login' | 'join' }) {
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const joining = mode === 'join';

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    const id = slug.trim().toLowerCase();
    if (!/^[a-z0-9-]{2,40}$/.test(id)) { setError('频道标识只能使用 2–40 位小写字母、数字或短横线。'); return; }
    if (joining && !name.trim()) { setError('请填写姓名。'); return; }
    if (password.length < (joining ? 8 : 1)) { setError(joining ? '密码至少 8 位。' : '请输入密码。'); return; }
    setBusy(true);
    try {
      const session = joining ? await join(id, name.trim(), password) : await login(id, password);
      setSession(session ?? { slug: id, name: name || id });
      if (joining) invalidate();
      navigate('/studio');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '操作未完成，请稍后重试。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page auth">
      <Masthead />
      <form className="auth-card" onSubmit={submit} noValidate>
        <p className="auth-kicker"><i className="tally" />{joining ? '开通新频道' : '大咖登录'}</p>
        <h1>{joining ? '入驻 AUFD，拥有自己的作品频道' : '回到你的频道'}</h1>
        <p className="auth-lead">{joining
          ? '频道标识就是你的主页地址，也是登录账号。入驻后只有你能编辑自己的频道。'
          : '登录后可以编辑自己的资料与作品，其他人的频道只能浏览。'}</p>
        <label className="field">
          <span>频道标识</span>
          <span className="field-prefix"><em>aufd/</em>
            <input value={slug} onChange={e => setSlug(e.target.value)} autoComplete="username" placeholder="例如 liurunsen" required /></span>
        </label>
        {joining && <label className="field"><span>姓名</span>
          <input value={name} onChange={e => setName(e.target.value)} autoComplete="name" maxLength={40} required /></label>}
        <label className="field"><span>密码</span>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            autoComplete={joining ? 'new-password' : 'current-password'} required /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="pill pill-signal pill-block" type="submit" disabled={busy}>
          {busy && <LoaderCircle className="spin" size={16} aria-hidden="true" />}{joining ? '开通频道' : '登录'}
        </button>
        <p className="auth-switch">{joining
          ? <>已经有频道？<Link to="/login">登录</Link></>
          : <>还没有频道？<Link to="/join">入驻</Link></>}</p>
      </form>
    </div>
  );
}
