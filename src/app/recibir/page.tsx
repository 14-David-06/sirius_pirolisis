import FlujoRecepcion from './FlujoRecepcion';

// Página estática: el servidor nunca ve el token, que viaja en el fragmento
// (`/recibir#v1.…`) y lo lee FlujoRecepcion en el navegador.
export default function RecibirPage() {
  return <FlujoRecepcion />;
}
