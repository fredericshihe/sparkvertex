import Hero from '@/components/Hero';

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col relative">
      <div className="flex-grow pt-16 relative">
        <Hero />
      </div>
    </main>
  );
}
