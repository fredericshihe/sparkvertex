import CreateClient from './CreateClient';
import { Suspense } from 'react';

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen pt-24 px-4 flex justify-center"><i className="fa-solid fa-circle-notch fa-spin text-3xl text-brand-500"></i></div>}>
      <CreateClient />
    </Suspense>
  );
}
