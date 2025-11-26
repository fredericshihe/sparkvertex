'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useModal } from '@/context/ModalContext';

export default function EditProfileModal() {
  const { isEditProfileModalOpen, closeEditProfileModal, openLoginModal } = useModal();
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
      alert('上传头像失败: ' + error.message);
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

      alert('资料更新成功！');
      closeEditProfileModal();
      // Trigger a reload or update context if needed
      window.location.reload(); 
    } catch (error: any) {
      console.error('Error updating profile:', error);
      alert('更新失败: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isEditProfileModalOpen) return null;

  return (
    <div className="fixed inset-0 z-[110]">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm touch-none" onClick={closeEditProfileModal}></div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-8 shadow-2xl animate-float-up overscroll-contain">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold flex items-center gap-2 text-white">
            <i className="fa-solid fa-user-pen text-brand-500"></i>
            编辑资料
          </h2>
          <button onClick={closeEditProfileModal} className="text-slate-400 hover:text-white w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-800 transition">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
        
        <div className="space-y-4">
          {/* Avatar */}
          <div className="flex flex-col items-center mb-6">
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="relative w-24 h-24 rounded-full overflow-hidden border-2 border-slate-600 cursor-pointer group"
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
            <span className="text-xs text-slate-500 mt-2">点击更换头像</span>
          </div>

          {/* Username */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">昵称</label>
            <input 
              type="text" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:border-brand-500 outline-none text-sm"
              placeholder="设置一个响亮的昵称"
            />
          </div>

          {/* Bio */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">个人简介</label>
            <textarea 
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:border-brand-500 outline-none resize-none text-sm"
              placeholder="介绍一下你自己..."
            ></textarea>
          </div>

          {/* Submit */}
          <button 
            onClick={handleSubmit}
            disabled={loading}
            className="w-full py-3 bg-brand-600 hover:bg-brand-500 text-white rounded-lg font-bold transition shadow-lg shadow-brand-500/30 disabled:opacity-50 disabled:cursor-not-allowed mt-4"
          >
            {loading ? <i className="fa-solid fa-circle-notch fa-spin mr-2"></i> : null}
            保存修改
          </button>
        </div>
      </div>
    </div>
  );
}
