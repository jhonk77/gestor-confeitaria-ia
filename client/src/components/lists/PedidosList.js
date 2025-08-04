import React, { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';

function PedidosList() {
    const [pedidos, setPedidos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const functions = getFunctions();

    useEffect(() => {
        fetchPedidos();
    }, []);

    const fetchPedidos = async () => {
        setLoading(true);
        setError(null);
        try {
            const listarPedidos = httpsCallable(functions, 'listarPedidos');
            const result = await listarPedidos();
            setPedidos(result.data.orders);
        } catch (err) {
            console.error("Error fetching orders:", err);
            setError('Falha ao carregar os pedidos.');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return <div>Carregando pedidos...</div>;
    }

    if (error) {
        return <div>Erro: {error}</div>;
    }

    return (
        <div>
            <h3>Seus Pedidos</h3>
            {pedidos.length === 0 ? (
                <p>Nenhum pedido registrado ainda.</p>
            ) : (
                <table className="table table-striped">
                    <thead>
                        <tr>
                            <th>Cliente</th>
                            <th>Produtos</th>
                            <th>Data de Entrega</th>
                            <th>Valor</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {pedidos.map((pedido) => (
                            <tr key={pedido.id}>
                                <td>{pedido.customer}</td>
                                <td>{pedido.products.join(', ')}</td>
                                <td>{new Date(pedido.deliveryDate).toLocaleDateString()}</td>
                                <td>R$ {pedido.value.toFixed(2)}</td>
                                <td>{pedido.status}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}

export default PedidosList;
