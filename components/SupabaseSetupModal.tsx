/**
 * Supabase Setup Modal - 引导用户配置 Supabase 后端
 * 
 * 功能：
 * 1. 显示生成的数据库 Schema
 * 2. 提供一键复制 SQL
 * 3. 引导用户配置 Supabase 凭证
 */

'use client';

import { useState } from 'react';
import { GeneratedSchema } from '@/lib/supabase-schema-generator';

interface SupabaseSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  schema: GeneratedSchema | null;
  language: string;
  onCredentialsSubmit: (url: string, anonKey: string) => void;
}

export default function SupabaseSetupModal({
  isOpen,
  onClose,
  schema,
  language,
  onCredentialsSubmit,
}: SupabaseSetupModalProps) {
  const [activeTab, setActiveTab] = useState<'sql' | 'code' | 'setup'>('setup');
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseAnonKey, setSupabaseAnonKey] = useState('');
  const [copiedSql, setCopiedSql] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  if (!isOpen || !schema) return null;

  const t = {
    zh: {
      title: 'Supabase 后端配置',
      subtitle: 'AI 已为你的应用生成了数据库结构',
      tabSetup: '配置引导',
      tabSql: 'SQL Schema',
      tabCode: '前端代码',
      tables: '数据表',
      step1Title: '步骤 1: 创建 Supabase 项目',
      step1Desc: '如果你还没有 Supabase 账号，请先注册',
      step1Button: '打开 Supabase Dashboard',
      step2Title: '步骤 2: 执行数据库迁移',
      step2Desc: '复制 SQL Schema，在 Supabase SQL Editor 中执行',
      step2Button: '查看 SQL',
      step3Title: '步骤 3: 获取 API 凭证',
      step3Desc: '在 Project Settings -> API 中找到以下信息',
      urlLabel: 'Project URL',
      urlPlaceholder: 'https://xxx.supabase.co',
      keyLabel: 'anon public key',
      keyPlaceholder: 'eyJhbGciOiJIUzI1NiIs...',
      submitButton: '保存并应用',
      copyButton: '复制',
      copiedButton: '已复制 ✓',
      close: '关闭',
    },
    en: {
      title: 'Supabase Backend Setup',
      subtitle: 'AI has generated database schema for your app',
      tabSetup: 'Setup Guide',
      tabSql: 'SQL Schema',
      tabCode: 'Frontend Code',
      tables: 'Tables',
      step1Title: 'Step 1: Create Supabase Project',
      step1Desc: 'Sign up for Supabase if you don\'t have an account',
      step1Button: 'Open Supabase Dashboard',
      step2Title: 'Step 2: Run Database Migration',
      step2Desc: 'Copy the SQL Schema and execute it in Supabase SQL Editor',
      step2Button: 'View SQL',
      step3Title: 'Step 3: Get API Credentials',
      step3Desc: 'Find these in Project Settings -> API',
      urlLabel: 'Project URL',
      urlPlaceholder: 'https://xxx.supabase.co',
      keyLabel: 'anon public key',
      keyPlaceholder: 'eyJhbGciOiJIUzI1NiIs...',
      submitButton: 'Save & Apply',
      copyButton: 'Copy',
      copiedButton: 'Copied ✓',
      close: 'Close',
    }
  }[language === 'zh' ? 'zh' : 'en'];

  const handleCopySql = async () => {
    await navigator.clipboard.writeText(schema.sql);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  const handleCopyCode = async () => {
    await navigator.clipboard.writeText(schema.frontendCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleSubmit = () => {
    if (supabaseUrl && supabaseAnonKey) {
      onCredentialsSubmit(supabaseUrl, supabaseAnonKey);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="p-6 border-b border-slate-700 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <i className="fa-solid fa-database text-white text-xl"></i>
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">{t.title}</h2>
                <p className="text-sm text-slate-400">{t.subtitle}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-colors"
            >
              <i className="fa-solid fa-xmark text-slate-400"></i>
            </button>
          </div>
          
          {/* Tables Badge */}
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="text-xs text-slate-500 mr-1">{t.tables}:</span>
            {schema.tables.map(table => (
              <span key={table.name} className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded-full text-xs">
                {table.name}
              </span>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-700 flex-shrink-0">
          {[
            { key: 'setup', label: t.tabSetup, icon: 'fa-list-check' },
            { key: 'sql', label: t.tabSql, icon: 'fa-code' },
            { key: 'code', label: t.tabCode, icon: 'fa-file-code' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`flex-1 py-3 px-4 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                activeTab === tab.key
                  ? 'text-emerald-400 border-b-2 border-emerald-400 bg-emerald-500/5'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className={`fa-solid ${tab.icon}`}></i>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'setup' && (
            <div className="space-y-6">
              {/* Step 1 */}
              <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0 font-bold">
                    1
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-white">{t.step1Title}</h3>
                    <p className="text-sm text-slate-400 mt-1">{t.step1Desc}</p>
                    <a
                      href="https://supabase.com/dashboard"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 mt-3 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      <i className="fa-solid fa-external-link"></i>
                      {t.step1Button}
                    </a>
                  </div>
                </div>
              </div>

              {/* Step 2 */}
              <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0 font-bold">
                    2
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-white">{t.step2Title}</h3>
                    <p className="text-sm text-slate-400 mt-1">{t.step2Desc}</p>
                    <button
                      onClick={() => setActiveTab('sql')}
                      className="inline-flex items-center gap-2 mt-3 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      <i className="fa-solid fa-code"></i>
                      {t.step2Button}
                    </button>
                  </div>
                </div>
              </div>

              {/* Step 3 */}
              <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0 font-bold">
                    3
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-white">{t.step3Title}</h3>
                    <p className="text-sm text-slate-400 mt-1">{t.step3Desc}</p>
                    <div className="mt-4 space-y-3">
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">{t.urlLabel}</label>
                        <input
                          type="text"
                          value={supabaseUrl}
                          onChange={(e) => setSupabaseUrl(e.target.value)}
                          placeholder={t.urlPlaceholder}
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">{t.keyLabel}</label>
                        <input
                          type="password"
                          value={supabaseAnonKey}
                          onChange={(e) => setSupabaseAnonKey(e.target.value)}
                          placeholder={t.keyPlaceholder}
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      <button
                        onClick={handleSubmit}
                        disabled={!supabaseUrl || !supabaseAnonKey}
                        className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:from-slate-600 disabled:to-slate-600 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-all"
                      >
                        {t.submitButton}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'sql' && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <button
                  onClick={handleCopySql}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    copiedSql
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-700 hover:bg-slate-600 text-white'
                  }`}
                >
                  <i className={`fa-solid ${copiedSql ? 'fa-check' : 'fa-copy'} mr-2`}></i>
                  {copiedSql ? t.copiedButton : t.copyButton}
                </button>
              </div>
              <pre className="bg-slate-950 border border-slate-700 rounded-xl p-4 overflow-x-auto text-sm text-slate-300 font-mono">
                {schema.sql}
              </pre>
            </div>
          )}

          {activeTab === 'code' && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <button
                  onClick={handleCopyCode}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    copiedCode
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-700 hover:bg-slate-600 text-white'
                  }`}
                >
                  <i className={`fa-solid ${copiedCode ? 'fa-check' : 'fa-copy'} mr-2`}></i>
                  {copiedCode ? t.copiedButton : t.copyButton}
                </button>
              </div>
              <pre className="bg-slate-950 border border-slate-700 rounded-xl p-4 overflow-x-auto text-sm text-slate-300 font-mono">
                {schema.frontendCode}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-700 flex justify-end flex-shrink-0">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {t.close}
          </button>
        </div>
      </div>
    </div>
  );
}
