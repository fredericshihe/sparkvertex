import Hero from '@/components/Hero';

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col relative">
      <div className="flex-grow relative">
        <Hero />
      </div>
    </div>
  );
}
