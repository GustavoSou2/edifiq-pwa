// ============================================================
// firebase.config.ts
// Inicialização do Firebase e exportação das instâncias
// necessárias para o Realtime Database.
// ============================================================

import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

/**
 * Substitua os valores abaixo pelas credenciais do seu projeto
 * no console do Firebase (Project Settings > Your apps > SDK setup).
 *
 * ⚠️ Em produção, use variáveis de ambiente (environment.ts) para
 * não expor as chaves no controle de versão.
 */
export const firebaseConfig = {
  apiKey: "AIzaSyAQ-lieUKMNaGEtchpHDNsqy1k5HD4_zHE",
  authDomain: "edifiq-logistic.firebaseapp.com",
  projectId: "edifiq-logistic",
  storageBucket: "edifiq-logistic.firebasestorage.app",
  messagingSenderId: "569786522662",
  appId: "1:569786522662:web:3bb74e0511fe7b6fd5dae7",
  measurementId: "G-1RVPLZ6Z60",
  databaseURL: "https://edifiq-logistic-default-rtdb.firebaseio.com/"
};
// Instância principal do app Firebase (singleton)
export const firebaseApp = initializeApp(firebaseConfig);

// Instância do Realtime Database pronta para uso nos serviços
export const firebaseDB = getDatabase(firebaseApp);
