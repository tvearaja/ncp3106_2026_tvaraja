import {getSupabase,isSupabaseConfigured} from './supabase.js';

const form=document.querySelector('form[data-auth]');
const message=document.querySelector('#authMessage');
const themeToggle=document.querySelector('#themeToggle');
const savedTheme=localStorage.getItem('flowguard-theme')||'light';document.documentElement.dataset.bsTheme=savedTheme;
if(themeToggle){themeToggle.innerHTML=savedTheme==='dark'?'<i class="bi bi-sun"></i>':'<i class="bi bi-moon-stars"></i>';themeToggle.onclick=()=>{const next=document.documentElement.dataset.bsTheme==='dark'?'light':'dark';document.documentElement.dataset.bsTheme=next;localStorage.setItem('flowguard-theme',next);themeToggle.innerHTML=next==='dark'?'<i class="bi bi-sun"></i>':'<i class="bi bi-moon-stars"></i>';};}
function showMessage(text,kind='info'){message.className=`alert alert-${kind}`;message.textContent=text;message.classList.remove('d-none');}
if(form){
  form.addEventListener('submit',async event=>{
    event.preventDefault();message.classList.add('d-none');
    if(!isSupabaseConfigured){showMessage('Supabase is not configured yet. Copy config.example.js to config.js and add your project URL and anon key.','warning');return;}
    const button=form.querySelector('[type=submit]');button.disabled=true;button.dataset.label=button.textContent;button.textContent='Please wait…';
    try{
      const supabase=await getSupabase(),data=new FormData(form);
      if(form.dataset.auth==='register'){
        const {data:result,error}=await supabase.auth.signUp({email:data.get('email'),password:data.get('password'),options:{data:{full_name:data.get('full_name'),contact_number:data.get('contact_number')}}});
        if(error)throw error;
        if(result.session)showMessage('Registration received. Your account is pending administrator approval. You can sign in after it is approved.','success');
        else showMessage('Check your email to confirm your address. Your account will remain pending until an administrator approves it.','success');
        form.reset();
      }else{
        const {data:result,error}=await supabase.auth.signInWithPassword({email:data.get('email'),password:data.get('password')});if(error)throw error;
        const {data:profile,error:profileError}=await supabase.from('profiles').select('role,status').eq('id',result.user.id).single();
        if(profileError)throw profileError;
        if(profile.status!=='approved'){await supabase.auth.signOut();throw new Error(profile.status==='disabled'?'This account is disabled. Contact an administrator.':`This account is ${profile.status}. Staff access is available only after approval.`);}
        location.href='portal.html';
      }
    }catch(error){showMessage(error.message||'Authentication could not be completed.','danger');}
    finally{button.disabled=false;button.textContent=button.dataset.label;}
  });
}
