"use client";

import Image from "next/image";
import Link from "next/link";

export default function Navbar() {
  return (
    <header className="w-full px-6 py-4 relative z-30 font-museo-slab">
      <nav className="max-w-7xl mx-auto flex justify-between items-center">
        <div className="px-10">
          <Link href="/">
            <Image
              src="/logo.png"
              alt="Sirius Logo"
              width={180}
              height={200}
              priority
              className="transition-transform duration-300 hover:scale-105 cursor-pointer"
            />
          </Link>
        </div>
        <div className="flex items-center">
          <Link href="/login">
            <button className="bg-[#5A7836] text-white px-6 py-2 rounded-lg transition-all duration-300 transform hover:bg-[#4a6429] hover:scale-105 hover:shadow-lg hover:shadow-[#5A7836]/30 active:scale-95">
              Acceder
            </button>
          </Link>
        </div>
      </nav>
    </header>
  );
}
