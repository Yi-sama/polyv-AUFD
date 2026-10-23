const app = document.querySelector('#app');
const dialog = document.querySelector('#dialog');
const TYPE = { poster: '海报', photo: '照片', video: '视频' };
const ICON = { poster: 'panels-top-left', photo: 'image', video: 'play' };
const DEMO_VID = '88083abbf5bcf1356e05d39666be527a_8';
let data;
let draft;
let dirty = false;
let saving = false;
let uploadCount = 0;
let selectedWork = null;
let filter = 'all';
let activeRoute = '';
let player = null;
let playerReady = false;
let playerGeneration = 0;
let playerTimer;
let sdkPromise;
let toastTimer;
let modal = null;
let gallery = [];
let galleryIndex = 0;
let tourStep = 0;

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
const iconButton = (name, label, action, attrs = '') => `<button class="icon-button" type="button" title="${esc(label)}" aria-label="${esc(label)}" data-action="${action}" ${attrs}>${icon(name)}</button>`;
const time = seconds => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
const prettyDate = date => date ? date.replaceAll('-', '.') : '';
function icons() { window.lucide?.createIcons({ attrs: { 'stroke-width': 1.65 } }); }
function toast(message, error = false) {
  const el = document.querySelector('#toast');
  clearTimeout(toastTimer);
  el.textContent = message;
  el.className = `show${error ? ' error' : ''}`;
  toastTimer = setTimeout(() => el.className = '', 4500);
}
async function api(url, options) {
  const response = await fetch(url, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '请求失败');
  return result;
}
function header(edit = false) {
  return `<header class="site-header"><div class="header-inner">
    <a class="brand" href="#/" aria-label="AUFD 作品集首页">aufd<span>.</span></a>
    ${edit ? '<span class="editor-heading">作品集管理</span>' : `<nav aria-label="主导航">
      <button data-action="section" data-section="works">作品</button>
      <button data-action="section" data-section="about">关于</button>
    </nav>`}
    <div class="header-actions">${edit ? `
      <span id="save-state" class="save-state">${dirty ? '未保存' : '已保存到本机'}</span>
      <a href="#/" class="button secondary">${icon('eye')}<span>查看主页</span></a>
      <button class="button primary" data-action="save" id="save-button">${icon('save')}<span>保存作品集</span></button>
    ` : `${iconButton('share-2', '分享作品集', 'share')}
      <a class="icon-button" href="#/edit" aria-label="编辑作品集" title="编辑作品集">${icon('pencil')}</a>
      <button class="button dark" data-action="contact">${icon('arrow-up-right')}<span>联系我</span></button>`}</div>
  </div></header>`;
}
function footer() {
  return `<footer class="site-footer"><a class="brand small" href="#/">aufd<span>.</span></a>
    <span>© 2026 ${esc(data.profile.name)}</span><span class="footer-credit">影像播放由 POLYV 保利威支持</span>
    <button class="icon-button" title="回到顶部" aria-label="回到顶部" data-action="top">${icon('arrow-up')}</button>
  </footer>`;
}
function workCard(work) {
  return `<article class="work-card ${work.type}">
    <a href="#/work/${esc(work.id)}" class="work-image" aria-label="查看作品：${esc(work.title)}">
      <img src="${esc(work.cover)}" alt="${esc(work.title)}" loading="lazy">
      <span class="media-label">${icon(ICON[work.type])}${work.isDemo ? '官方示例' : TYPE[work.type]}</span>
      ${work.type === 'video' ? `<span class="play-circle">${icon('play')}</span>` : ''}
      <span class="work-open">${icon('arrow-up-right')}</span>
    </a>
    <div class="work-caption"><div><p>${esc(work.subtitle)}</p><h3><a href="#/work/${esc(work.id)}">${esc(work.title)}</a></h3></div><span>${esc(prettyDate(work.date))}</span></div>
  </article>`;
}
function home() {
  const p = data.profile;
  const works = data.works.filter(w => filter === 'all' || w.type === filter);
  const ordered = [...works].sort((a, b) => Number(b.featured) - Number(a.featured));
  return `${header()}<main id="main" class="home">
    <section class="profile-intro content-width" aria-labelledby="person-name">
      <div class="intro-top"><div><p class="person-role">${esc(p.role)}</p>
        <h1 id="person-name">${esc(p.name)}<span>${esc(p.alias)}</span></h1></div>
        <button class="button tour-button" data-action="tour">${icon('play')}<span>快速认识我</span>${icon('arrow-up-right')}</button>
      </div>
      <p class="person-bio">${esc(p.bio)}</p>
    </section>
    <figure class="cover-strip">
      <img src="${esc(p.cover)}" alt="${esc(p.name)}作品集封面，来自参赛海报" fetchpriority="high">
      <figcaption><span class="cover-caption">每个想法，都值得被看见。</span><span class="cover-note">创作记录 <span>2026</span></span></figcaption>
    </figure>
    <section class="works-section content-width" id="works" aria-labelledby="works-title">
      <div class="section-heading"><div><span class="section-kicker">我的创作</span><h2 id="works-title">精选作品<span>${String(data.works.length).padStart(2, '0')}</span></h2></div>
        <div class="filter-tabs" role="group" aria-label="作品类型">
          ${[['all', '全部'], ['poster', '海报'], ['photo', '照片'], ['video', '视频']].map(([key, label]) =>
            `<button data-action="filter" data-filter="${key}" aria-pressed="${filter === key}" class="${filter === key ? 'active' : ''}">${label}${key === 'all' ? '' : `<span>${data.works.filter(w => w.type === key).length}</span>`}</button>`).join('')}
        </div>
      </div>
      <div class="works-grid ${filter !== 'all' ? 'filtered' : ''}">${ordered.length ? ordered.map(workCard).join('') : '<div class="empty-state"><p>还没有这类作品</p><button class="button secondary" data-action="filter" data-filter="all">查看全部作品</button></div>'}</div>
    </section>
    <section class="about-section" id="about"><div class="content-width about-inner">
      <div><span class="section-kicker">关于我</span><h2>创作，持续发生。</h2></div>
      <div class="about-copy"><p>${esc(p.about)}</p><button class="text-button" data-action="contact">聊聊下一个想法 ${icon('arrow-up-right')}</button></div>
    </div></section>
  </main>${footer()}`;
}
function videoMarkup(work) {
  return `<div class="video-stage" data-video-id="${esc(work.videoId)}">
    <div id="polyv-player"><div class="player-loading">${icon('loader-circle')}<span>正在连接保利威播放器</span></div></div>
  </div>
  <div class="video-status-row"><span id="player-status" role="status">等待播放器初始化</span><span>POLYV ${work.isDemo ? '/ 官方示例视频' : '/ 云点播'}</span></div>
  ${work.highlights.length ? `<div class="highlights"><span>片段</span>${work.highlights.map(h => `<button class="highlight" data-action="seek" data-seconds="${h.seconds}" disabled>${icon('play')}<span>${esc(h.title)}</span><time>${time(h.seconds)}</time></button>`).join('')}</div>` : ''}`;
}
function detail(id) {
  const work = data.works.find(w => w.id === id);
  if (!work) return `${header()}<main id="main" class="empty-state"><h1>这件作品不存在</h1><a href="#/" class="button dark">返回作品集</a></main>${footer()}`;
  const others = data.works.filter(w => w.id !== id).slice(0, 2);
  return `${header()}<main id="main" class="detail-page content-width">
    <a class="back-link" href="#/">${icon('arrow-left')}返回作品集</a>
    <div class="detail-heading"><div><p class="section-kicker">${esc(work.subtitle)}</p><h1>${esc(work.title)}</h1></div>${iconButton('share-2', '分享这个作品', 'share')}</div>
    <div class="detail-meta"><span>${TYPE[work.type]}</span><span>${esc(prettyDate(work.date))}</span>${work.isDemo ? '<span class="demo-badge">官方示例，非个人作品</span>' : `<span>${esc(data.profile.name)}</span>`}</div>
    ${work.type === 'video' ? videoMarkup(work) : `<button class="detail-image ${work.type}" data-action="lightbox" data-work="${esc(work.id)}" data-index="0" aria-label="放大查看${esc(work.title)}"><img src="${esc(work.cover)}" alt="${esc(work.title)}"><span>${icon('expand')}</span></button>`}
    <div class="detail-story"><h2>作品背后</h2><p>${esc(work.description)}</p></div>
    ${work.images.length > 1 ? `<div class="detail-gallery">${work.images.map((src, i) => `<button data-action="lightbox" data-work="${esc(work.id)}" data-index="${i}" aria-label="查看第 ${i + 1} 张图片"><img src="${esc(src)}" alt="${esc(work.title)}，图片 ${i + 1}" loading="lazy"></button>`).join('')}</div>` : ''}
    ${others.length ? `<section class="more-works"><h2>继续看看</h2><div class="more-grid">${others.map(workCard).join('')}</div></section>` : ''}
  </main>${footer()}`;
}

function field(label, key, value, { area = false, max = 200, required = false, type = 'text', scope = 'profile', rows = 3 } = {}) {
  const attrs = `name="${esc(key)}" data-field="${esc(key)}" data-scope="${scope}" maxlength="${max}" ${required ? 'required' : ''}`;
  return `<label class="field"><span>${label}${required ? '<b> *</b>' : ''}</span>${area ? `<textarea ${attrs} rows="${rows}">${esc(value)}</textarea>` : `<input type="${type}" ${attrs} value="${esc(value)}">`}</label>`;
}
function uploadControl(label, action, src, extra = '') {
  return `<div class="upload-field"><span>${label}</span><div class="upload-preview"><img src="${esc(src)}" alt="${label}"><label class="button secondary">${icon('image-up')}更换图片<input type="file" accept="image/jpeg,image/png,image/webp" data-upload="${action}" ${extra}></label></div></div>`;
}
function profileEditor() {
  const p = draft.profile;
  return `<div class="editor-panel"><div class="panel-title"><h1>个人资料</h1><span>主页内容</span></div>
    <div class="form-grid">${field('姓名', 'name', p.name, { required: true, max: 40 })}${field('英文名', 'alias', p.alias, { max: 40 })}</div>
    ${field('身份', 'role', p.role, { max: 80 })}${field('一句话简介', 'bio', p.bio, { area: true, max: 300 })}
    ${uploadControl('主页封面', 'profile-cover', p.cover)}
    ${field('关于我', 'about', p.about, { area: true, max: 2000, rows: 5 })}
    ${field('公开联系邮箱', 'email', p.email, { type: 'email', max: 120 })}
  </div>`;
}
function workEditor(work) {
  return `<div class="editor-panel"><div class="panel-title"><h1>编辑作品</h1><a href="#/work/${esc(work.id)}" class="text-button">查看作品 ${icon('arrow-up-right')}</a></div>
    ${field('作品名称', 'title', work.title, { scope: 'work', max: 100, required: true })}
    <div class="form-grid"><label class="field"><span>作品类型</span><select data-field="type" data-scope="work">${Object.entries(TYPE).map(([key, label]) => `<option value="${key}" ${work.type === key ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
    ${field('日期', 'date', work.date, { scope: 'work', type: 'date', max: 10 })}</div>
    ${field('分类说明', 'subtitle', work.subtitle, { scope: 'work', max: 160 })}
    ${uploadControl('作品封面', 'work-cover', work.cover, `data-work-id="${esc(work.id)}"`)}
    ${field('作品说明', 'description', work.description, { scope: 'work', area: true, max: 6000, rows: 6 })}
    <label class="checkbox-field"><input type="checkbox" data-field="featured" data-scope="work" ${work.featured ? 'checked' : ''}><span>设为精选作品</span>${icon('star')}</label>
    ${work.type === 'video' ? `<section class="video-editor"><h2>${icon('video')}保利威视频</h2>
      ${field('视频 VID', 'videoId', work.videoId, { scope: 'work', max: 100, required: true })}
      <div class="connection-info">${icon('info')}<span>${work.videoId === DEMO_VID ? '当前为保利威官方示例视频，非个人作品。' : '使用有播放权限的点播视频 VID；加密视频需额外配置服务端授权。'}</span></div>
      <h3>精彩片段</h3>
      <div class="highlight-editor">${work.highlights.map((h, i) => `<div class="highlight-row">
        <label><span>标题</span><input aria-label="片段 ${i + 1} 标题" data-highlight="${i}" data-key="title" value="${esc(h.title)}" maxlength="60" required></label>
        <label><span>起始秒数</span><input aria-label="片段 ${i + 1} 起始秒数" type="number" min="0" max="86400" step="1" data-highlight="${i}" data-key="seconds" value="${h.seconds}" required></label>
        ${iconButton('trash-2', `移除片段 ${i + 1}`, 'remove-highlight', `data-index="${i}"`)}
      </div>`).join('')}</div>
      <button type="button" class="button secondary" data-action="add-highlight" ${work.highlights.length >= 12 ? 'disabled' : ''}>${icon('plus')}添加片段</button>
    </section>` : `<section class="images-editor"><h2>作品图片 <span>${work.images.length}</span></h2>
      <div class="edit-image-grid">${work.images.map((src, i) => `<div class="edit-image"><img src="${esc(src)}" alt="作品图片 ${i + 1}">${iconButton('x', `移除图片 ${i + 1}`, 'remove-image', `data-index="${i}"`)}</div>`).join('')}
      <label class="image-add" aria-label="添加作品图片">${icon('plus')}<span>添加图片</span><input type="file" accept="image/jpeg,image/png,image/webp" data-upload="work-image" data-work-id="${esc(work.id)}" ${work.images.length >= 20 ? 'disabled' : ''}></label></div>
    </section>`}
    <div class="delete-work"><button class="text-button danger" type="button" data-action="delete-work">${icon('trash-2')}删除作品</button></div>
  </div>`;
}
function editor() {
  if (!draft) draft = structuredClone(data);
  const current = draft.works.find(w => w.id === selectedWork);
  return `${header(true)}<main id="main" class="editor-layout">
    <aside class="editor-sidebar"><button class="sidebar-item ${!current ? 'selected' : ''}" data-action="select-profile">${icon('user-round')}个人资料</button>
      <div class="sidebar-label"><span>作品 <span id="work-count">${draft.works.length}</span></span>${iconButton('plus', '新建作品', 'add-work', draft.works.length >= 40 ? 'disabled' : '')}</div>
      <div class="work-list">${draft.works.map((w, i) => `<div class="work-list-row ${w.id === selectedWork ? 'selected' : ''}">
        <button data-action="select-work" data-id="${esc(w.id)}"><img src="${esc(w.cover)}" alt=""><span><strong>${esc(w.title)}</strong><small>${TYPE[w.type]}${w.featured ? ' / 精选' : ''}</small></span></button>
        <div class="reorder">${iconButton('chevron-up', `上移${w.title}`, 'move-work', `data-id="${esc(w.id)}" data-direction="-1" ${i === 0 ? 'disabled' : ''}`)}${iconButton('chevron-down', `下移${w.title}`, 'move-work', `data-id="${esc(w.id)}" data-direction="1" ${i === draft.works.length - 1 ? 'disabled' : ''}`)}</div>
      </div>`).join('')}</div>
      <div class="sidebar-foot">${icon('hard-drive')}<span>本机 Demo<br>内容保存在本机</span></div>
    </aside>
    <form id="editor-form" class="editor-form">${current ? workEditor(current) : profileEditor()}</form>
  </main>`;
}

function destroyPlayer() {
  playerGeneration++;
  clearTimeout(playerTimer);
  if (player) {
    try { player.destroy(); } catch (error) { console.warn('播放器销毁失败', error); }
  }
  player = null;
  playerReady = false;
}
function loadSdk() {
  if (window.polyvPlayer) return Promise.resolve();
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timeout = setTimeout(() => {
      script.remove();
      sdkPromise = null;
      reject(new Error('保利威播放器加载超时，请检查网络后重试'));
    }, 20000);
    script.src = 'https://player.polyv.net/resp/vod-player/latest/player.js';
    script.onload = () => { clearTimeout(timeout); resolve(); };
    script.onerror = () => {
      clearTimeout(timeout); script.remove(); sdkPromise = null;
      reject(new Error('无法加载保利威播放器，请检查网络连接'));
    };
    document.head.append(script);
  });
  return sdkPromise;
}
async function mountPlayer(work) {
  destroyPlayer();
  const generation = playerGeneration;
  const mount = document.querySelector('#polyv-player');
  const status = document.querySelector('#player-status');
  if (!mount || !status) return;
  const update = (message, state) => {
    if (generation !== playerGeneration || !status.isConnected) return;
    status.textContent = message;
    status.dataset.state = state;
  };
  try {
    await loadSdk();
    if (generation !== playerGeneration || !mount.isConnected) return;
    mount.innerHTML = '';
    player = window.polyvPlayer({
      wrap: mount, width: '100%', height: '100%', vid: work.videoId,
      autoplay: false, forceH5: true, ban_history_time: 'on',
      hideSwitchPlayer: true, screenshot: false, pictureInPicture: true,
      loading_bg_img: new URL(work.cover, location.origin).href,
      cover_opacity: 20, cover_display: 'scaleAspectFit'
    });
    playerTimer = setTimeout(() => {
      update('视频加载时间较长，请检查网络或视频权限', 'error');
      showRetry(work);
    }, 25000);
    player.on('s2j_onPlayerInitOver', () => {
      if (generation !== playerGeneration) return;
      clearTimeout(playerTimer);
      playerReady = true;
      update('播放器已就绪', 'ready');
      document.querySelectorAll('[data-action="seek"]').forEach(button => button.disabled = false);
      document.querySelector('.retry-player')?.remove();
    });
    player.on('s2j_onVideoPlay', () => update('正在播放', 'playing'));
    player.on('s2j_onVideoPause', () => update('已暂停', 'ready'));
    player.on('s2j_onPlayOver', () => update('播放结束', 'ready'));
    const failed = () => {
      if (generation !== playerGeneration) return;
      clearTimeout(playerTimer);
      playerReady = false;
      document.querySelectorAll('[data-action="seek"]').forEach(button => button.disabled = true);
      update('播放失败，请检查 VID、网络或视频授权', 'error');
      showRetry(work);
    };
    player.on('s2j_onPlayerError', failed);
    player.on('serverError', failed);
  } catch (error) {
    if (generation !== playerGeneration) return;
    mount.innerHTML = `<div class="player-loading"><span>${esc(error.message)}</span></div>`;
    update('未连接', 'error');
    showRetry(work);
  }
}
function showRetry(work) {
  if (document.querySelector('.retry-player')) return;
  const row = document.querySelector('.video-status-row');
  if (!row) return;
  const button = document.createElement('button');
  button.className = 'text-button retry-player';
  button.textContent = '重新连接';
  button.onclick = () => { button.remove(); mountPlayer(work); };
  row.append(button);
}
function seek(seconds) {
  if (!playerReady || !player) return toast('播放器尚未就绪', true);
  const duration = Number(player.j2s_getDuration());
  if (duration > 0 && seconds >= duration) return toast('片段起点超出视频时长，请调整片段', true);
  player.j2s_seekVideo(seconds);
  player.j2s_resumeVideo();
}

function route() {
  const next = location.hash || '#/';
  if (dirty && activeRoute === '#/edit' && next !== activeRoute) {
    if (!window.confirm('还有未保存的修改，确定离开吗？')) {
      history.replaceState(null, '', activeRoute);
      return;
    }
    draft = null;
    dirty = false;
  }
  if (dialog.open) dialog.close();
  destroyPlayer();
  activeRoute = next;
  const match = next.match(/^#\/work\/([a-zA-Z0-9_-]+)$/);
  if (next === '#/edit') app.innerHTML = editor();
  else if (match) app.innerHTML = detail(match[1]);
  else app.innerHTML = home();
  document.title = `${data.profile.name} ${data.profile.alias} | AUFD`;
  icons();
  window.scrollTo(0, 0);
  if (match) {
    const work = data.works.find(w => w.id === match[1]);
    if (work?.type === 'video') mountPlayer(work);
  }
}
function refreshEditor() {
  const scroll = window.scrollY;
  app.innerHTML = editor();
  icons();
  window.scrollTo(0, scroll);
}
function markDirty() {
  dirty = true;
  const state = document.querySelector('#save-state');
  if (state) { state.textContent = '未保存'; state.classList.add('unsaved'); }
}
async function save() {
  if (saving) return;
  if (uploadCount) return toast('图片正在上传，请稍后保存', true);
  if (!document.querySelector('#editor-form').reportValidity()) return;
  saving = true;
  const button = document.querySelector('#save-button');
  button.disabled = true;
  button.innerHTML = `${icon('loader-circle')}保存中`;
  icons();
  try {
    data = await api('/api/portfolio', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) });
    draft = structuredClone(data);
    dirty = false;
    refreshEditor();
    toast('作品集已保存');
  } catch (error) {
    toast(error.message, true);
    button.disabled = false;
    button.innerHTML = `${icon('save')}<span>保存作品集</span>`;
    icons();
  } finally { saving = false; }
}

function openDialog(content, className = '') {
  dialog.className = className;
  dialog.innerHTML = content;
  icons();
  if (!dialog.open) dialog.showModal();
}
function contact() {
  const email = data.profile.email;
  modal = 'contact';
  openDialog(`<div class="contact-dialog"><div class="dialog-top"><span>联系 ${esc(data.profile.name)}</span>${iconButton('x', '关闭', 'close')}</div>
    <h2>让下一个想法<br>从一次交流开始。</h2>
    ${email ? `<a class="button primary" href="mailto:${esc(email)}">${icon('mail')}${esc(email)}</a>` : `<p class="muted">暂未设置公开联系邮箱</p><a href="#/edit" class="button secondary">${icon('pencil')}编辑联系信息</a>`}
  </div>`);
}
function lightbox(id, index) {
  const work = data.works.find(w => w.id === id);
  gallery = [...new Set([work.cover, ...work.images])];
  galleryIndex = Math.max(0, Math.min(index, gallery.length - 1));
  modal = 'lightbox';
  renderLightbox(work.title);
}
function renderLightbox(title = modalTitle) {
  modalTitle = title;
  openDialog(`<div class="lightbox-top"><h2>${esc(title)}</h2><span>${galleryIndex + 1} / ${gallery.length}</span>${iconButton('x', '关闭图片', 'close')}</div>
    <div class="lightbox-stage"><img src="${esc(gallery[galleryIndex])}" alt="${esc(title)}">
      ${gallery.length > 1 ? `${iconButton('chevron-left', '上一张图片', 'previous-image')}${iconButton('chevron-right', '下一张图片', 'next-image')}` : ''}
    </div>
    <a class="lightbox-download" href="${esc(gallery[galleryIndex])}" download>${icon('download')}下载原图</a>`, 'lightbox-dialog');
}
let modalTitle = '';
function tour() {
  tourStep = 0;
  modal = 'tour';
  renderTour();
}
function renderTour() {
  destroyPlayer();
  const p = data.profile;
  const representative = data.works.find(w => w.featured && w.type !== 'video') || data.works.find(w => w.type !== 'video');
  const video = data.works.find(w => w.type === 'video');
  const slides = [{ title: '很高兴认识你', html: `<img class="tour-portrait" src="${esc(p.cover)}" alt="作品集封面"><div class="tour-intro"><p>${esc(p.role)}</p><h2>${esc(p.name)} <span>${esc(p.alias)}</span></h2><p>${esc(p.bio)}</p></div>` }];
  if (representative) slides.push({ title: '我的代表作品', html: `<div class="tour-work"><img src="${esc(representative.cover)}" alt="${esc(representative.title)}"><div><p class="section-kicker">${esc(representative.subtitle)}</p><h2>${esc(representative.title)}</h2><p>${esc(representative.description)}</p><a class="text-button" href="#/work/${esc(representative.id)}">查看完整作品 ${icon('arrow-up-right')}</a></div></div>` });
  if (video) slides.push({ title: video.isDemo ? '视频展映 / 官方示例' : '我的影像作品', html: `<div class="tour-video">${videoMarkup(video)}<h2>${esc(video.title)}</h2>${video.isDemo ? '<p class="muted">保利威官方示例，非个人作品</p>' : ''}</div>` });
  tourStep = Math.max(0, Math.min(tourStep, slides.length - 1));
  openDialog(`<div class="tour-top"><span>${slides[tourStep].title}</span>${iconButton('x', '关闭快速认识我', 'close')}</div>
    <div class="tour-progress">${slides.map((_, i) => `<span class="${i <= tourStep ? 'passed' : ''}"></span>`).join('')}</div>
    <div class="tour-content">${slides[tourStep].html}</div>
    <div class="tour-bottom"><span>${tourStep + 1} / ${slides.length}</span><div>
      ${iconButton('arrow-left', '上一步', 'tour-prev', tourStep === 0 ? 'disabled' : '')}
      <button class="button dark" data-action="${tourStep === slides.length - 1 ? 'close' : 'tour-next'}">${tourStep === slides.length - 1 ? '开始探索' : '继续看看'}${icon('arrow-right')}</button>
    </div></div>`, 'tour-dialog');
  if (video && tourStep === slides.length - 1 && slides.length > 1) mountPlayer(video);
}
async function share() {
  const url = `${location.origin}${location.pathname}${location.hash === '#/edit' ? '#/' : location.hash || '#/'}`;
  modal = 'share';
  openDialog(`<div class="share-dialog"><div class="dialog-top"><h2>分享作品集</h2>${iconButton('x', '关闭分享', 'close')}</div>
    <p class="muted">当前是本机地址，只能在这台电脑打开。</p>
    <label class="field"><span>页面地址</span><input id="share-url" readonly value="${esc(url)}"></label>
    <button class="button primary" data-action="copy-link">${icon('copy')}复制链接</button></div>`);
}
async function upload(input) {
  const file = input.files[0];
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 6 * 1024 * 1024) {
    input.value = '';
    return toast('请选择不超过 6MB 的 JPG、PNG 或 WebP 图片', true);
  }
  const destination = input.dataset.upload;
  const targetDraft = draft;
  const targetWork = draft.works.find(w => w.id === input.dataset.workId);
  uploadCount++;
  input.disabled = true;
  toast('图片上传中');
  try {
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = () => reject(new Error('无法读取图片'));
      reader.readAsDataURL(file);
    });
    const result = await api('/api/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ base64, type: file.type }) });
    if (draft !== targetDraft || activeRoute !== '#/edit') return;
    if (destination === 'profile-cover') draft.profile.cover = result.url;
    else if (!targetWork || !draft.works.includes(targetWork)) return;
    else if (destination === 'work-cover') {
      const previous = targetWork.cover;
      targetWork.cover = result.url;
      targetWork.images = targetWork.images.map(src => src === previous ? result.url : src);
    } else if (targetWork.images.length < 20) targetWork.images.push(result.url);
    markDirty();
    refreshEditor();
    toast('图片已添加，保存后更新作品集');
  } catch (error) { toast(error.message, true); }
  finally { uploadCount--; input.disabled = false; input.value = ''; }
}

document.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  const action = button.dataset.action;
  const current = draft?.works.find(w => w.id === selectedWork);
  if (['save', 'add-highlight', 'remove-highlight', 'remove-image', 'delete-work'].includes(action)) event.preventDefault();
  switch (action) {
    case 'filter': {
      filter = button.dataset.filter;
      const scroll = window.scrollY;
      app.innerHTML = home(); icons(); window.scrollTo(0, scroll);
      break;
    }
    case 'section':
      if (activeRoute !== '#/') { location.hash = '#/'; setTimeout(() => document.getElementById(button.dataset.section)?.scrollIntoView({ behavior: 'smooth' }), 50); }
      else document.getElementById(button.dataset.section)?.scrollIntoView({ behavior: 'smooth' });
      break;
    case 'top': window.scrollTo({ top: 0, behavior: 'smooth' }); break;
    case 'share': share(); break;
    case 'copy-link':
      try { await navigator.clipboard.writeText(document.querySelector('#share-url').value); toast('链接已复制'); }
      catch { document.querySelector('#share-url').select(); toast('无法自动复制，链接已选中', true); }
      break;
    case 'contact': contact(); break;
    case 'close': dialog.close(); break;
    case 'tour': tour(); break;
    case 'tour-next': tourStep++; renderTour(); break;
    case 'tour-prev': tourStep--; renderTour(); break;
    case 'lightbox': lightbox(button.dataset.work, Number(button.dataset.index)); break;
    case 'previous-image': galleryIndex = (galleryIndex - 1 + gallery.length) % gallery.length; renderLightbox(); break;
    case 'next-image': galleryIndex = (galleryIndex + 1) % gallery.length; renderLightbox(); break;
    case 'seek': seek(Number(button.dataset.seconds)); break;
    case 'select-profile': selectedWork = null; refreshEditor(); break;
    case 'select-work': selectedWork = button.dataset.id; refreshEditor(); break;
    case 'save': await save(); break;
    case 'add-work':
      if (draft.works.length >= 40) break;
      selectedWork = crypto.randomUUID();
      draft.works.push({ id: selectedWork, type: 'photo', title: '新的作品', subtitle: '', date: '',
        description: '', cover: '/assets/poster.jpg', images: [], featured: false, videoId: '', isDemo: false, highlights: [] });
      markDirty(); refreshEditor(); break;
    case 'move-work': {
      const index = draft.works.findIndex(w => w.id === button.dataset.id);
      const next = index + Number(button.dataset.direction);
      if (next >= 0 && next < draft.works.length) {
        [draft.works[index], draft.works[next]] = [draft.works[next], draft.works[index]];
        markDirty(); refreshEditor();
      }
      break;
    }
    case 'delete-work':
      if (current && window.confirm(`删除“${current.title}”？保存后生效。`)) {
        draft.works = draft.works.filter(w => w.id !== current.id);
        selectedWork = null; markDirty(); refreshEditor();
      }
      break;
    case 'remove-image': current.images.splice(Number(button.dataset.index), 1); markDirty(); refreshEditor(); break;
    case 'add-highlight':
      if (current.highlights.length < 12) current.highlights.push({ title: '新片段', seconds: 0 });
      markDirty(); refreshEditor(); break;
    case 'remove-highlight': current.highlights.splice(Number(button.dataset.index), 1); markDirty(); refreshEditor(); break;
  }
});
document.addEventListener('input', event => {
  const input = event.target;
  if (!draft || saving) return;
  const current = draft.works.find(w => w.id === selectedWork);
  if (input.dataset.field) {
    const target = input.dataset.scope === 'work' ? current : draft.profile;
    target[input.dataset.field] = input.type === 'checkbox' ? input.checked : input.value;
    markDirty();
    if (input.dataset.field === 'type') {
      if (current.type === 'video' && !current.videoId) { current.videoId = DEMO_VID; current.isDemo = true; }
      refreshEditor();
    }
  } else if (input.dataset.highlight !== undefined) {
    const h = current.highlights[Number(input.dataset.highlight)];
    h[input.dataset.key] = input.dataset.key === 'seconds' ? Number(input.value) : input.value;
    markDirty();
  }
});
document.addEventListener('change', event => {
  if (event.target.dataset.upload) upload(event.target);
});
document.addEventListener('submit', event => {
  if (event.target.id === 'editor-form') { event.preventDefault(); save(); }
});
dialog.addEventListener('close', () => {
  if (modal === 'tour') {
    destroyPlayer();
    const match = activeRoute.match(/^#\/work\/([a-zA-Z0-9_-]+)$/);
    const work = match && data.works.find(w => w.id === match[1]);
    if (work?.type === 'video') mountPlayer(work);
  }
  modal = null;
  dialog.innerHTML = '';
});
dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
document.addEventListener('keydown', event => {
  if (dialog.open && modal === 'lightbox' && gallery.length > 1) {
    if (event.key === 'ArrowRight') { galleryIndex = (galleryIndex + 1) % gallery.length; renderLightbox(); }
    if (event.key === 'ArrowLeft') { galleryIndex = (galleryIndex - 1 + gallery.length) % gallery.length; renderLightbox(); }
  }
});
window.addEventListener('beforeunload', event => {
  if (dirty || uploadCount || saving) { event.preventDefault(); event.returnValue = ''; }
});
window.addEventListener('hashchange', route);
try { data = await api('/api/portfolio'); route(); }
catch (error) {
  app.innerHTML = `<main class="empty-state"><h1>暂时无法打开作品集</h1><p>${esc(error.message)}</p><button class="button dark" onclick="location.reload()">重新加载</button></main>`;
}
