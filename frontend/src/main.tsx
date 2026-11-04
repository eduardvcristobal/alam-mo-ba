import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import AdminApp from './AdminApp';
import './admin.css';
import './app.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode>{window.location.pathname.startsWith('/admin')?<AdminApp/>:<App/>}</React.StrictMode>);
