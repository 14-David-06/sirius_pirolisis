"use client";

export default function Footer() {
  return (
    <footer className="bg-black text-white py-12 relative z-30 font-museo-slab">
      <div className="max-w-7xl mx-auto px-6 text-center">
        <p className="text-gray-300 mb-4 transition-colors duration-300 hover:text-white">
          Sirius Regenerative Solutions S.A.S
        </p>
        <p className="text-gray-400 text-sm mb-6">
          ZOMAC 2025 - Todos los derechos reservados
        </p>
        <div className="flex justify-center space-x-6">
          <a 
            href="#" 
            className="text-gray-400 hover:text-white transition-all duration-300 transform hover:scale-110 hover:underline decoration-[#5A7836] underline-offset-4"
          >
            Términos y Condiciones
          </a>
          <a 
            href="#" 
            className="text-gray-400 hover:text-white transition-all duration-300 transform hover:scale-110 hover:underline decoration-[#5A7836] underline-offset-4"
          >
            Política de Privacidad
          </a>
          <a 
            href="#" 
            className="text-gray-400 hover:text-white transition-all duration-300 transform hover:scale-110 hover:underline decoration-[#5A7836] underline-offset-4"
          >
            Contacto
          </a>
        </div>
      </div>
    </footer>
  );
}
