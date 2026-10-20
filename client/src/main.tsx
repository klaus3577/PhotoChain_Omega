// Belépési pont: betűk (saját hosztolás, @fontsource – nem Google CDN), stílusok, majd az alkalmazás
// böngészős routerrel. A StrictMode fejlesztéskor kétszer futtatja az effekteket, így előjönnek a
// mellékhatás-hibák.
// Forrás: Fontsource – Variable Fonts, https://fontsource.org/docs/getting-started/variable (adaptálva)
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import './styles/index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';

import { App } from './App';
import { createQueryClient } from './lib/queryClient';
import { createRoutes } from './routes/router';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Hiányzik a #root elem az index.html-ből.');

createRoot(rootElement).render(
  <StrictMode>
    <App router={createBrowserRouter(createRoutes())} queryClient={createQueryClient()} />
  </StrictMode>,
);
