import React, { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';

function DespesasList() {
    const [despesas, setDespesas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const functions = getFunctions();

    useEffect(() => {
        fetchDespesas();
    }, []);

    const fetchDespesas = async () => {
        setLoading(true);
        setError(null);
        try {
            const listarDespesas = httpsCallable(functions, 'listarDespesas');
            const result = await listarDespesas();
            setDespesas(result.data.expenses);
        } catch (err) {
            console.error("Error fetching expenses:", err);
            setError('Falha ao carregar as despesas.');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return <div>Carregando despesas...</div>;
    }

    if (error) {
        return <div>Erro: {error}</div>;
    }

    return (
        <div>
            <h3>Suas Despesas</h3>
            {despesas.length === 0 ? (
                <p>Nenhuma despesa registrada ainda.</p>
            ) : (
                <table className="table table-striped">
                    <thead>
                        <tr>
                            <th>Data</th>
                            <th>Tipo</th>
                            <th>Valor</th>
                            <th>Fornecedor</th>
                        </tr>
                    </thead>
                    <tbody>
                        {despesas.map((despesa) => (
                            <tr key={despesa.id}>
                                <td>{new Date(despesa.date).toLocaleDateString()}</td>
                                <td>{despesa.type}</td>
                                <td>R$ {despesa.value.toFixed(2)}</td>
                                <td>{despesa.supplier}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}

export default DespesasList;
