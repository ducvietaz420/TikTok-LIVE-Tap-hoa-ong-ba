const $=id=>document.getElementById(id);
let state,toastTimer,giftCatalog=[],giftDraft=[],giftDirty=false,giftEditorKey='';
const format=n=>new Intl.NumberFormat('vi-VN').format(n||0);
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3500);}
async function post(path,data={}){try{const r=await fetch('/api/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const result=await r.json();if(!r.ok)throw Error(result.error);return result;}catch(e){toast('Chưa thực hiện được: '+e.message);throw e;}}
function render(next){state=next;renderGiftEditor();renderVisitors();const online=state.connection==='connected';$('connection-title').textContent=online?'Đã nối TikFinity':state.connection==='connecting'?'Đang tìm TikFinity…':'Đang chờ TikFinity Desktop';$('connection-detail').textContent=online?'Cầu nối đã sẵn sàng · Chờ sự kiện từ phòng LIVE':'Mở TikFinity và kết nối tài khoản LIVE · localhost:21213';$('status-icon').parentElement.classList.toggle('connected',online);$('stat-points').textContent=format(state.points);$('stat-level').innerHTML=`${state.level}<small> / 5</small>`;$('stat-likes').textContent=format(state.likes);$('stat-follows').textContent=format(state.followers);
for(const key of ['voiceEnabled','autoSpeech','ambientEnabled','night'])$(key).checked=state.settings[key];
$('musicEnabled').checked=state.settings.musicEnabled!==false;
for(const key of ['shopName','weather','quality','speechInterval'])if(document.activeElement!==$(key))$(key).value=state.settings[key];
if(document.activeElement!==$('volume'))$('volume').value=state.settings.volume*100;
if(document.activeElement!==$('musicVolume'))$('musicVolume').value=(Number.isFinite(state.settings.musicVolume)?state.settings.musicVolume:.28)*100;
$('music-volume-label').textContent=`${Math.round(Number($('musicVolume').value))}%`;
$('volume-label').textContent=`${Math.round(state.settings.volume*100)}%`;$('speech-label').textContent=`${state.settings.speechInterval} giây`;$('pause').textContent=state.settings.paused?'▶ Mở cửa lại':'Ⅱ Tạm nghỉ';}
const stream=new EventSource('/events');stream.addEventListener('state',event=>render(JSON.parse(event.data)));stream.onerror=()=>{$('connection-title').textContent='Mất kết nối bộ cảnh';$('connection-detail').textContent='Chạy lại BAT-DAU.cmd nếu máy chủ đã tắt.';};
for(const button of document.querySelectorAll('[data-action]'))button.onclick=async()=>{button.disabled=true;try{await post('action',{action:button.dataset.action});toast(state?.settings.paused?'Tiệm đang nghỉ. Bấm Mở cửa lại để thử hiệu ứng.':'Đã gửi hiệu ứng đến màn hình phát.');}finally{setTimeout(()=>button.disabled=false,600);}};
for(const key of ['voiceEnabled','autoSpeech','ambientEnabled','musicEnabled','night','shopName','weather','quality'])$(key).addEventListener('change',()=>post('settings',{[key]:$(key).type==='checkbox'?$(key).checked:$(key).value}));
for(const key of ['volume','speechInterval']){$(key).oninput=()=>{$(key==='volume'?'volume-label':'speech-label').textContent=key==='volume'?`${$(key).value}%`:`${$(key).value} giây`;};$(key).onchange=()=>post('settings',{[key]:Number($(key).value)/(key==='volume'?100:1)});}
$('musicVolume').oninput=()=>{$('music-volume-label').textContent=`${$('musicVolume').value}%`;};
$('musicVolume').onchange=()=>post('settings',{musicVolume:Number($('musicVolume').value)/100});
$('pause').onclick=()=>post('settings',{paused:!state?.settings.paused});$('reconnect').onclick=()=>post('reconnect').then(()=>toast('Đang kết nối lại TikFinity…'));
const overlayURL=location.origin+'/overlay';$('overlay-url').textContent=overlayURL;
$('copy-url').onclick=async()=>{try{await navigator.clipboard.writeText(overlayURL);toast('Đã sao chép URL màn hình phát.');}catch{const range=document.createRange();range.selectNodeContents($('overlay-url'));getSelection().removeAllRanges();getSelection().addRange(range);toast('Đã chọn URL. Nhấn Ctrl+C để sao chép.');}};
$('reset').onclick=()=>{if(confirm('Đặt lại điểm quà và danh sách khách quý về 0? Thao tác này không thay đổi quà trên TikTok.'))post('reset').then(()=>toast('Đã đặt lại điểm và danh sách khách quý.'));};

function renderVisitors(){
  const interval=Number.isFinite(state.settings.residentInterval)?state.settings.residentInterval:5;
  if(document.activeElement!==$('residentsEnabled'))$('residentsEnabled').checked=state.settings.residentsEnabled!==false;
  if(document.activeElement!==$('residentInterval'))$('residentInterval').value=interval;
  $('resident-interval-label').textContent=`${$('residentInterval').value} giây`;
  $('stat-visitors').textContent=format(state.visitorsEntered);
}
$('residentsEnabled').onchange=()=>post('settings',{residentsEnabled:$('residentsEnabled').checked});
$('residentInterval').oninput=()=>{$('resident-interval-label').textContent=`${$('residentInterval').value} giây`;};
$('residentInterval').onchange=()=>post('settings',{residentInterval:Number($('residentInterval').value)});
$('test-viewer').onclick=async()=>{
  const button=$('test-viewer');button.disabled=true;
  try{await post('test-viewer');toast(state?.settings.paused?'Tiệm đang nghỉ. Bấm Mở cửa lại trước khi thử.':'Đã gửi khách thử mang avatar mẫu đi qua. Không cộng điểm quà.');}
  catch{}
  finally{setTimeout(()=>button.disabled=false,800);}
};

function renderGiftEditor(force=false){
  if(!state||giftDirty)return;
  const key=JSON.stringify(state.giftRules||[])+giftCatalog.length;if(!force&&key===giftEditorKey)return;giftEditorKey=key;
  giftDraft=structuredClone(state.giftRules||[]);$('gift-editor').replaceChildren();
  const options=giftCatalog.length?giftCatalog:giftDraft;
  for(const rule of giftDraft){
    const row=document.createElement('div');row.className='gift-editor-row';row.dataset.ruleId=rule.id;
    const action=document.createElement('div');action.className='gift-editor-action';const image=document.createElement('img');image.alt=rule.giftName;if(rule.icon)image.src=rule.icon;
    const caption=document.createElement('div');const label=document.createElement('b');label.textContent=rule.label;const id=document.createElement('small');id.textContent=`ID ${rule.giftId||'chưa gán'} · ${rule.diamonds??'–'} xu`;caption.append(label,id);action.append(image,caption);
    const select=document.createElement('select');select.setAttribute('aria-label',`Quà cho ${rule.label}`);
    for(const item of options){const option=document.createElement('option');option.value=item.giftId;option.textContent=`${item.giftName} · ${item.diamonds??'–'} xu`;select.append(option);}
    select.value=rule.giftId;
    select.onchange=()=>{const gift=options.find(item=>item.giftId===select.value);if(!gift)return;Object.assign(rule,{giftId:gift.giftId,giftName:gift.giftName,icon:gift.icon,aliases:gift.aliases||[],diamonds:gift.diamonds});image.src=rule.icon;image.alt=rule.giftName;id.textContent=`ID ${rule.giftId} · ${rule.diamonds} xu`;giftDirty=true;row.classList.add('edited');$('save-gifts').disabled=false;$('gift-summary').textContent='CÓ THAY ĐỔI CHƯA LƯU';};
    const test=document.createElement('button');test.className='gift-test';test.textContent='Thử';test.setAttribute('aria-label',`Thử quà ${rule.label}`);
    test.onclick=async()=>{if(giftDirty)return toast('Lưu cách gán quà trước khi thử.');test.disabled=true;try{const result=await post('test-gift',{ruleId:rule.id});row.classList.add('testing');toast(result.action?`Đang thử ${rule.label}: ${rule.giftName}. Không cộng điểm.`:'Tiệm đang nghỉ. Bấm Mở cửa lại trước khi thử.');}finally{setTimeout(()=>{test.disabled=false;row.classList.remove('testing');},1300);}};
    row.append(action,select,test);$('gift-editor').append(row);
  }
  $('gift-summary').textContent=`${giftDraft.filter(rule=>rule.giftId&&rule.icon).length} / ${giftDraft.length} QUÀ ĐÃ GÁN`;
}
fetch('/gift-catalog.json').then(r=>r.json()).then(data=>{giftCatalog=data;renderGiftEditor(true);}).catch(()=>toast('Chưa nạp được danh sách quà để chỉnh sửa.'));
$('save-gifts').onclick=async()=>{const button=$('save-gifts');button.disabled=true;try{const result=await post('gifts',{rules:giftDraft});giftDirty=false;giftEditorKey='';render(result);toast('Đã lưu cách gán quà và cập nhật cột bên phải.');}catch{button.disabled=false;}};
$('restore-gifts').onclick=async()=>{const result=await post('gifts',{restore:true});giftDirty=false;giftEditorKey='';$('save-gifts').disabled=true;render(result);toast('Đã dùng lại 16 quà mặc định.');};
