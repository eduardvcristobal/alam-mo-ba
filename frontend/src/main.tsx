import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import AdminApp from './admin/AdminApp';
import './app.css';
if('serviceWorker' in navigator&&window.location.pathname!=='/admin'&&!window.location.pathname.startsWith('/admin/')){
 window.addEventListener('load',()=>{void navigator.serviceWorker.register('/sw.js').catch(error=>console.warn('App install support is unavailable:',error));},{once:true});
}
createRoot(document.getElementById('root')!).render(<React.StrictMode>{window.location.pathname.startsWith('/admin')?<AdminApp/>:<App/>}</React.StrictMode>);
