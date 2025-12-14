import Link from 'next/link';
import Image from 'next/image';

export default function Header() {
  return (
    <header className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center">
            {/* Placeholder for logo - update src when logo is added to public folder */}
            <div className="text-2xl font-bold text-gray-900">
              PawPress
            </div>
            {/* Uncomment when logo is ready:
            <Image 
              src="/logo.png" 
              alt="PawPress Logo" 
              width={150} 
              height={40}
              className="h-10 w-auto"
            />
            */}
          </Link>
        </div>
      </div>
    </header>
  );
}
