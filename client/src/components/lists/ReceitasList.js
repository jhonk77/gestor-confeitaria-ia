import React, { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';

function ReceitasList() {
    const [receitas, setReceitas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const functions = getFunctions();

    useEffect(() => {
        fetchReceitas();
    }, []);

    const fetchReceitas = async () => {
        setLoading(true);
        setError(null);
        try {
            const listarReceitas = httpsCallable(functions, 'listarReceitas');
            const result = await listarReceitas();
            setReceitas(result.data.recipes);
        } catch (err) {
            console.error("Error fetching recipes:", err);
            setError('Falha ao carregar as receitas.');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return <div>Carregando receitas...</div>;
    }

    if (error) {
        return <div>Erro: {error}</div>;
    }

    return (
        <div>
            <h3>Suas Receitas</h3>
            {receitas.length === 0 ? (
                <p>Nenhuma receita criada ainda.</p>
            ) : (
                <div className="row">
                    {receitas.map((receita) => (
                        <div className="col-md-6 col-lg-4 mb-3" key={receita.id}>
                            <div className="card">
                                <div className="card-body">
                                    <h5 className="card-title">{receita.name}</h5>
                                    <h6 className="card-subtitle mb-2 text-muted">Ingredientes:</h6>
                                    <ul>
                                        {receita.ingredients.map((ing, index) => (
                                            <li key={index}>{ing}</li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default ReceitasList;
