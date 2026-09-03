import FormulaireAlertes from '../../components/FormulaireAlertes';

export default function MesAlertes() {
  return (
    <main style={{ padding: '40px', fontFamily: 'sans-serif', maxWidth: '700px', margin: '0 auto' }}>
      <h1>Recevoir des alertes par email</h1>
      <p style={{ color: '#555', marginBottom: '32px' }}>
        Soyez prévenu(e) par email dès qu'une nouvelle étude scientifique est ajoutée
        sur les aliments qui vous intéressent.
      </p>

      <FormulaireAlertes />
    </main>
  );
}
