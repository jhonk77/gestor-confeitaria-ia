import React, { useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';

function RegistrarPedidoModal({ show, handleClose }) {
    const [cliente, setCliente] = useState('');
    const [produtos, setProdutos] = useState('');
    const [dataEntrega, setDataEntrega] = useState('');
    const [valor, setValor] = useState('');
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);

    const functions = getFunctions();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const registrarPedido = httpsCallable(functions, 'registrarPedido');
            await registrarPedido({ cliente, produtos: produtos.split(','), dataEntrega, valor });
            handleClose(); // Close modal on success
        } catch (err) {
            console.error("Error registering order:", err);
            setError('Falha ao registrar pedido. Verifique os dados e tente novamente.');
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
                        <h5 className="modal-title">Registrar Novo Pedido</h5>
                        <button type="button" className="btn-close" onClick={handleClose}></button>
                    </div>
                    <div className="modal-body">
                        {error && <div className="alert alert-danger">{error}</div>}
                        <form onSubmit={handleSubmit}>
                            <div className="mb-3">
                                <label htmlFor="cliente" className="form-label">Cliente</label>
                                <input type="text" className="form-control" id="cliente" value={cliente} onChange={(e) => setCliente(e.target.value)} required />
                            </div>
                            <div className="mb-3">
                                <label htmlFor="produtos" className="form-label">Produtos (separados por vírgula)</label>
                                <input type="text" className="form-control" id="produtos" value={produtos} onChange={(e) => setProdutos(e.target.value)} required />
                            </div>
                            <div className="mb-3">
                                <label htmlFor="dataEntrega" className="form-label">Data de Entrega</label>
                                <input type="date" className="form-control" id="dataEntrega" value={dataEntrega} onChange={(e) => setDataEntrega(e.target.value)} required />
                            </div>
                            <div className="mb-3">
                                <label htmlFor="valor" className="form-label">Valor</label>
                                <input type="number" className="form-control" id="valor" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0.00" required />
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={handleClose}>Cancelar</button>
                                <button type="submit" className="btn btn-primary" disabled={loading}>
                                    {loading ? 'Salvando...' : 'Salvar Pedido'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default RegistrarPedidoModal;
