'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useModal } from '@/context/ModalContext';
import { useLanguage } from '@/context/LanguageContext';

export default function EditProfileModal() {
  const { isEditProfileModalOpen, closeEditProfileModal, openLoginModal } = useModal();
  const { t } = useLanguage();
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditProfileModalOpen) {
      fetchProfile();
    }
  }, [isEditProfileModalOpen]);

  const fetchProfile = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single();

    if (data) {
      setUsername(data.username || '');
      setBio(data.bio || '');
      setAvatarUrl(data.avatar_url || '');
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const fileExt = file.name.split('.').pop();
      const fileName = `${session.user.id}-${Math.random()}.${fileExt}`;
      const filePath = `avatars/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('public') // Assuming 'public' bucket exists, or 'avatars'
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('public')
        .getPublicUrl(filePath);

      setAvatarUrl(publicUrl);
    } catch (error: any) {
      console.error('Error uploading avatar:', error);
      alert(t.edit_profile.upload_fail + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        openLoginModal();
        return;
      }

      const updates = {
        id: session.user.id,
        username,
        bio,
        avatar_url: avatarUrl,
        // updated_at: new Date().toISOString(), // Removed as column might not exist
      };

      const { error } = await supabase.from('profiles').upsert(updates);
      if (error) throw error;

      alert(t.edit_profile.update_success);
      closeEditProfileModal();
      // Trigger a reload or update context if needed
      window.location.reload(); 
    } catch (error: any) {
      console.error('Error updating profile:', error);
      alert(t.edit_profile.update_fail + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isEditProfileModalOpen) return null;

  return (
    <div className="fixed inset-0 z-[110]">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm touch-none" onClick={closeEditProfileModal}></div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-black/60 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 shadow-[0_8px_32px_rgba(0,0,0,0.4)] animate-in zoom-in fade-in duration-300 ring-1 ring-white/5">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold flex items-center gap-2 text-white">
            <i className="fa-solid fa-user-pen text-brand-500"></i>
            {t.edit_profile.title}
          </h2>
          <button onClick={closeEditProfileModal} className="text-slate-400 hover:text-white w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
        
        <div className="space-y-4">
          {/* Avatar */}
          <div className="flex flex-col items-center mb-6">
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="relative w-24 h-24 rounded-full overflow-hidden border-2 border-white/10 cursor-pointer group"
            >
              <img 
                src={avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`} 
                className="w-full h-full object-cover" 
                alt="Avatar" 
              />
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                <i className="fa-solid fa-camera text-white"></i>
              </div>
            </div>
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/*"
              onChange={handleAvatarUpload}
            />
            <span className="text-xs text-slate-500 mt-2">{t.edit_profile.change_avatar}</span>
          </div>

          {/* Username */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">{t.edit_profile.nickname}</label>
            <input 
              type="text" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-brand-500/50 focus:bg-black/40 outline-none text-sm transition-all placeholder-slate-500"
              placeholder={t.edit_profile.nickname_placeholder}
            />
          </div>

          {/* Bio */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">{t.edit_profile.bio}</label>
            <textarea 
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-brand-500/50 focus:bg-black/40 outline-none resize-none text-sm transition-all placeholder-slate-500"
              placeholder={t.edit_profile.bio_placeholder}
            ></textarea>
          </div>

          {/* Submit */}
          <button 
            onClick={handleSubmit}
            disabled={loading}
            className="w-full py-3 bg-brand-600 hover:bg-brand-500 text-white rounded-xl font-bold transition shadow-lg shadow-brand-500/20 disabled:opacity-50 disabled:cursor-not-allowed mt-4"
          >
            {loading ? <i className="fa-solid fa-circle-notch fa-spin mr-2"></i> : null}
            {t.edit_profile.save}
          </button>
        </div>
      </div>
    </div>
  );
}
