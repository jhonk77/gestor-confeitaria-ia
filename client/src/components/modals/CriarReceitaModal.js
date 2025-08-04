import React, { useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';

function CriarReceitaModal({ show, handleClose }) {
    const [recipeName, setRecipeName] = useState('');
    const [ingredients, setIngredients] = useState('');
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);

    const functions = getFunctions();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const criarReceita = httpsCallable(functions, 'criarReceita');
            await criarReceita({ recipeName, ingredients: ingredients.split('\n') });
            handleClose(); // Close modal on success
        } catch (err) {
            console.error("Error creating recipe:", err);
            setError('Falha ao criar receita. Verifique os dados e tente novamente.');
        } finally {
            setLoading(false);
        }
    };

    if (!show) {
        return null;
    }

    return (
        <div className="modal show d-block" tabIndex="-1">
            <div className="modal-dialog">
                <div className="modal-content">
                    <div className="modal-header">
                        <h5 className="modal-title">Criar Nova Receita</h5>
                        <button type="button" className="btn-close" onClick={handleClose}></button>
                    </div>
                    <div className="modal-body">
                        {error && <div className="alert alert-danger">{error}</div>}
                        <form onSubmit={handleSubmit}>
                            <div className="mb-3">
                                <label htmlFor="recipeName" className="form-label">Nome da Receita</label>
                                <input type="text" className="form-control" id="recipeName" value={recipeName} onChange={(e) => setRecipeName(e.target.value)} required />
                            </div>
                            <div className="mb-3">
                                <label htmlFor="ingredients" className="form-label">Ingredientes (um por linha)</label>
                                <textarea className="form-control" id="ingredients" rows="5" value={ingredients} onChange={(e) => setIngredients(e.target.value)} required></textarea>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={handleClose}>Cancelar</button>
                                <button type="submit" className="btn btn-primary" disabled={loading}>
                                    {loading ? 'Salvando...' : 'Salvar Receita'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default CriarReceitaModal;
