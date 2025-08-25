import React, { useState, useEffect, useRef } from 'react';
import { TrendingUp, TrendingDown, Activity, DollarSign, Target, BarChart3, Zap, Volume2, ArrowUp, ArrowDown } from 'lucide-react';

const TradingDashboard = () => {
    // FOR checking the connection
    const [connectionStatus, setConnectionStatus] = useState('connecting');
    const [connectionError, setConnectionError] = useState('');

    // FOR positions storing
    const [positions, setPositions] = useState([]);

    // FOR storing the openPosition
    const [openingOrders, setOpeningOrders] = useState([]);
    const [openingOrdersQty, setOpeningOrdersQty] = useState(null);

    // FOR storing the closePosition
    const [closingOrders, setClosingOrders] = useState([]);
    const [closingOrdersQty, setClosingOrdersQty] = useState(null);

    // For temp PF orders and OrderID
    const [tempOrders, setTempOrders] = useState(null);
    const [orderIDs, setOrderIDs] = useState(null);

    const [completedTrades, setCompletedTrades] = useState([]);

    const [metrics, setMetrics] = useState({
        totalTrades: 0,
        winCount: 0,
        lossCount: 0,
        totalPnL: 0,
        avgWin: 0,
        avgLoss: 0,
        winRate: 0,
    });

    const [lastUpdate, setLastUpdate] = useState(null);

    const wsRef = useRef(null);
    const reconnectTimeoutRef = useRef(null);
    const maxReconnectAttempts = 5;
    const reconnectAttemptRef = useRef(0);

    // Your Bybit API credentials
    const API_KEY = import.meta.env.VITE_API_KEY;
    const API_SECRET = import.meta.env.VITE_API_SECRET;

    // Generate authentication signature using Web Crypto API
    const generateSignature = async (apiSecret, expires) => {
        try {
            // Create encoder
            const encoder = new TextEncoder();

            // Create the message to sign
            const message = `GET/realtime${expires}`;

            // Import the secret key
            const key = await crypto.subtle.importKey(
                'raw',
                encoder.encode(apiSecret),
                { name: 'HMAC', hash: 'SHA-256' },
                false,
                ['sign']
            );

            // Sign the message
            const signature = await crypto.subtle.sign(
                'HMAC',
                key,
                encoder.encode(message)
            );

            // Convert ArrayBuffer to hex string
            const hashArray = Array.from(new Uint8Array(signature));
            const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

            return hashHex;
        } catch (error) {
            console.error('❌ Error generating signature:', error);
            throw error;
        }
    };

    const connectWebSocket = async () => {
        try {
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }

            if (!API_KEY || !API_SECRET) {
                setConnectionStatus('error');
                setConnectionError('API credentials not configured');
                return;
            }

            const url = import.meta.env.VITE_WS_URL;
            console.log(`🔌 Connecting to Bybit WebSocket: ${url}`);
            setConnectionStatus('connecting');
            setConnectionError('Connecting to Bybit...');

            wsRef.current = new WebSocket(url);

            wsRef.current.onopen = async () => {
                console.log('✅ Connected to Bybit WebSocket');
                setConnectionStatus('connected');
                setConnectionError('');

                try {
                    // Authenticate
                    const expires = Date.now() + 10000;
                    const signature = await generateSignature(API_SECRET, expires);

                    const authPayload = {
                        op: "auth",
                        args: [API_KEY, expires, signature],
                    };

                    wsRef.current.send(JSON.stringify(authPayload));
                } catch (error) {
                    console.error('❌ Authentication failed:', error);
                    setConnectionError('Authentication failed: ' + error.message);
                    wsRef.current.close();
                }
            };

            wsRef.current.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);

                    // Handle authentication response
                    if (data.op === "auth") {
                        if (data.success) {
                            console.log("✅ Authentication successful");

                            // Subscribe to order and position topics
                            const subscribePayload = {
                                op: "subscribe",
                                args: ["order", "position"]
                            };

                            wsRef.current.send(JSON.stringify(subscribePayload));
                        } else {
                            console.error("❌ Authentication failed:", data);
                            setConnectionError("Authentication failed: " + (data.ret_msg || "Unknown error"));
                            wsRef.current.close();
                        }
                    }

                    // Handle subscription response
                    else if (data.op === "subscribe") {
                        console.log("✅ Subscription result:", data.success ? "Success" : "Failed", data.ret_msg || '');
                        if (!data.success) {
                            setConnectionError("Subscription failed: " + (data.ret_msg || "Unknown error"));
                        }
                    }

                    // Handle order updates
                    else if (data.topic === "order") {
                        console.log("📋 Order update received:", data.data);
                        if (data.data && Array.isArray(data.data)) {
                            processOrderUpdate(data.data);
                        }
                    }

                    // Handle position updates
                    else if (data.topic === "position") {
                        if (data.data && Array.isArray(data.data)) {
                            processPositionUpdate(data.data);
                        }
                    }

                    // Handle ping
                    else if (data.op === "ping") {
                        wsRef.current.send(JSON.stringify({ op: "pong" }));
                    }

                    setLastUpdate(new Date());
                } catch (error) {
                    console.error("❌ Error parsing WebSocket message:", error);
                    setConnectionError(`Parse error: ${error.message}`);
                }
            };

            wsRef.current.onclose = (event) => {
                console.log(`❌ WebSocket closed: ${event.code} ${event.reason}`);
                setConnectionStatus('disconnected');
                setConnectionError(`Connection closed: ${event.code} ${event.reason || ''}`);

                // Reconnect after 3 seconds
                if (reconnectAttemptRef.current < maxReconnectAttempts) {
                    reconnectTimeoutRef.current = setTimeout(() => {
                        console.log('🔄 Attempting to reconnect...');
                        setConnectionStatus('connecting');
                        reconnectAttemptRef.current++;
                        connectWebSocket();
                    }, 3000);
                } else {
                    setConnectionStatus('error');
                    setConnectionError('Max reconnection attempts reached');
                }
            };

            wsRef.current.onerror = (error) => {
                console.error('❌ WebSocket error:', error);
                setConnectionStatus('error');
                setConnectionError('WebSocket connection error');
            };

        } catch (error) {
            console.error('❌ Failed to create WebSocket connection:', error);
            setConnectionStatus('error');
            setConnectionError(`Connection failed: ${error.message}`);
        }
    };

    const computeSummary = () => {
        if (openingOrders.length === 0 || closingOrders.length === 0) return;

        // symbol and time from first opening order
        const symbol = openingOrders[0].symbol;
        const time = openingOrders[0].createdTime;

        // calculate weighted entry price
        const openExecSum = openingOrders.reduce((acc, order) => acc + parseFloat(order.cumExecValue || 0), 0);
        const totalOpenQty = openingOrders.reduce((acc, order) => acc + parseFloat(order.qty || 0), 0);
        const EntryPrice = totalOpenQty > 0 ? openExecSum / totalOpenQty : 0;

        // calculate weighted exit price and realized PnL
        const closeExecSum = closingOrders.reduce((acc, order) => acc + parseFloat(order.cumExecValue || 0), 0);
        const totalCloseQty = closingOrders.reduce((acc, order) => acc + parseFloat(order.qty || 0), 0);
        const ExitPrice = totalCloseQty > 0 ? closeExecSum / totalCloseQty : 0;

        const realizedPnL = closingOrders.reduce((acc, order) => acc + parseFloat(order.closedPnl || 0), 0);

        // create summary object
        const tradeSummary = {
            symbol,
            time,
            EntryPrice,
            ExitPrice,
            realizedPnL
        };

        console.log("trade Summary",tradeSummary)

        // add to completedTrades state
        setCompletedTrades(prev => [...prev, tradeSummary]);

        // clear orders after computation
        setOpeningOrders([]);
        setClosingOrders([]);
        setOpeningOrdersQty(0);
        setClosingOrdersQty(0);

        calculateMatrix(tradeSummary);
    };

    const calculateQty = () => {
        console.log("Came Here")
        console.log("open qty", openingOrdersQty)
        console.log("close qty", closingOrdersQty)
        if (openingOrdersQty!=0 && closingOrdersQty!=0 && openingOrdersQty == closingOrdersQty){ 
            return true
        }
        return false
    };

    const processOrderUpdate = (orderDataComplete) => {
        console.log(`Processing ${orderDataComplete.length} order updates`);

        orderDataComplete.forEach(orderData => {
            console.log("Here", orderData.orderId);
            if (orderData.orderStatus === "Filled") {
                const closedPnl = parseFloat(orderData.closedPnl);
                console.log("this quantity", orderData.qty)
                console.log("this EXEquantity", orderData.cumExecQty)

                if (closedPnl === 0) {
                    // Opening order
                    if (orderIDs && orderIDs === orderData.orderId) {
                        setOpeningOrders(prev => [...prev, orderData]);
                        setOpeningOrdersQty(prev => prev + parseFloat(orderData.qty));
                        setOrderIDs(null);
                        setTempOrders(null);
                    } else if (orderIDs && orderIDs !== orderData.orderId) {
                        if (tempOrders) {
                            setOpeningOrders(prev => [...prev, tempOrders, orderData]);
                            setOpeningOrdersQty(prev => prev + parseFloat(tempOrders.qty) + parseFloat(orderData.qty));
                        }
                        setOpeningOrders(prev => [...prev, orderData]);
                        setOpeningOrdersQty(prev => prev + parseFloat(orderData.qty));
                        setOrderIDs(null);
                        setTempOrders(null);
                    } else if (!orderIDs) {
                        setOpeningOrders(prev => [...prev, orderData]);
                        setOpeningOrdersQty(prev => prev + parseFloat(orderData.qty));
                    }
                } else if (closedPnl != 0) {
                    // Closing order
                    if (orderIDs && orderIDs === orderData.orderId) {
                        setClosingOrders(prev => [...prev, orderData]);
                        setClosingOrdersQty(prev => prev + parseFloat(orderData.qty));
                        setTempOrders(null);
                        setOrderIDs(null);
                    } else if (orderIDs && orderIDs !== orderData.orderId) {
                        if (tempOrders) {
                            setClosingOrders(prev => [...prev, tempOrders, orderData]);
                            setClosingOrdersQty(prev => prev + parseFloat(tempOrders.qty) + parseFloat(orderData.qty));
                        } else {
                            setClosingOrders(prev => [...prev, orderData]);
                            setClosingOrdersQty(prev => prev + parseFloat(orderData.qty));
                        }
                        setOrderIDs(null);
                        setTempOrders(null);
                    } else if (!orderIDs) {
                        setClosingOrders(prev => [...prev, orderData]);
                        setClosingOrdersQty(prev => prev + parseFloat(orderData.qty));
                    }

                    if (calculateQty()) {
                        computeSummary();
                    }
                }
            } else if (orderData.orderStatus === "PartiallyFilled") {
                setTempOrders(orderData);
                setOrderIDs(orderData.orderId);
            }

            console.log("open qty", openingOrdersQty)
            console.log("close qty", closingOrdersQty)
        });
    };

    const calculateMatrix = (tradeSummary) => {
        setMetrics(prev => {
            const totalTrades = prev.totalTrades + 1;
            const winCount = prev.winCount + (tradeSummary.realizedPnL > 0 ? 1 : 0);
            const lossCount = prev.lossCount + (tradeSummary.realizedPnL < 0 ? 1 : 0);
            const totalPnL = prev.totalPnL + tradeSummary.realizedPnL;

            const avgWin = winCount > 0 ? totalPnL / winCount : 0;
            const avgLoss = lossCount > 0 ? Math.abs(totalPnL) / lossCount : 0;

            const winRate = totalTrades > 0 ? (winCount / totalTrades) * 100 : 0;

            return {
                totalTrades,
                winCount,
                lossCount,
                totalPnL,
                avgWin,
                avgLoss,
                winRate,
            };
        });
    };

    // Process position updates
    const processPositionUpdate = (positionData) => {
        const activePositions = positionData.filter(pos => parseFloat(pos.size || 0) > 0);
        setPositions(activePositions);
    };

    // Manual reconnect function
    const manualReconnect = () => {
        reconnectAttemptRef.current = 0;
        setConnectionStatus('connecting');
        setConnectionError('');
        connectWebSocket();
    };

    useEffect(() => {
        if (API_KEY && API_SECRET) {
            connectWebSocket();
        } else {
            setConnectionStatus('error');
            setConnectionError('API credentials not configured. Please set API credentials.');
        }

        return () => {
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            }
            if (wsRef.current) {
                wsRef.current.close();
            }
        };
    }, [API_KEY, API_SECRET]);

    const getStatusColor = () => {
        switch (connectionStatus) {
            case 'connected': return 'text-green-600 bg-green-100';
            case 'connecting': return 'text-yellow-600 bg-yellow-100';
            case 'disconnected': return 'text-red-600 bg-red-100';
            case 'error': return 'text-red-700 bg-red-200';
            default: return 'text-gray-600 bg-gray-100';
        }
    };

    const getSideColor = (side) => {
        return side?.toLowerCase() === 'buy' ? 'text-green-600 bg-green-100' : 'text-red-600 bg-red-100';
    };

    const formatNumber = (num, decimals = 2) => {
        return parseFloat(num || 0).toFixed(decimals);
    };

    const formatCurrency = (num) => {
        const value = parseFloat(num || 0);
        return `$${value.toFixed(2)}`;
    };

    return (
        <div className="w-screen min-h-screen bg-gray-50 p-4">
            <div className="max-w-7xl mx-auto">
                {/* Debug Info */}
                <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h3 className="font-medium text-blue-800 mb-2">Debug Information</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm text-blue-700">
                        <div>Opening Orders: {openingOrders.length}</div>
                        <div>Opening Qty: {openingOrdersQty}</div>
                        <div>Closing Orders: {closingOrders.length}</div>
                        <div>Closing Qty: {closingOrdersQty}</div>
                        <div>Completed Trades: {completedTrades.length}</div>
                        <div>Temp Orders: {tempOrders ? 'Yes' : 'No'}</div>
                    </div>
                    {openingOrders.length > 0 && (
                        <div className="mt-2">
                            <p className="text-sm text-blue-700">Latest Opening Orders:</p>
                            {openingOrders.slice(-3).map((order, index) => (
                                <div key={index} className="text-xs text-blue-600 ml-2">
                                    {order.symbol} - {order.side} - Qty: {order.cumExecQty}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Header */}
                <div className="mb-6">
                    <div className="flex flex-wrap gap-3">
                        <div className={`px-4 py-2 rounded-full text-sm font-medium ${getStatusColor()}`}>
                            {connectionStatus === 'connected' ? '🟢' :
                                connectionStatus === 'connecting' ? '🟡' :
                                    connectionStatus === 'disconnected' ? '🔴' : '⚠️'}
                            {connectionStatus.charAt(0).toUpperCase() + connectionStatus.slice(1)}
                        </div>
                        {connectionError && (
                            <div className="px-4 py-2 rounded-full text-sm font-medium text-red-700 bg-red-100">
                                ❌ {connectionError}
                            </div>
                        )}
                        {(connectionStatus === 'error' || connectionStatus === 'disconnected') && (
                            <button
                                onClick={manualReconnect}
                                className="px-4 py-2 rounded-full text-sm font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 transition-colors"
                            >
                                🔄 Reconnect
                            </button>
                        )}
                        {lastUpdate && (
                            <div className="px-4 py-2 rounded-full text-sm font-medium text-blue-700 bg-blue-100">
                                📅 Updated: {lastUpdate.toLocaleTimeString()}
                            </div>
                        )}
                    </div>
                </div>

                {/* Metrics Section */}
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-8">
                    <div className="bg-white p-4 rounded-xl shadow-sm border">
                        <div className="flex items-center gap-2 mb-2">
                            <BarChart3 className="w-4 h-4 text-blue-600" />
                            <span className="text-sm text-gray-600">Total Trades</span>
                        </div>
                        <p className="text-2xl font-bold text-gray-900">{metrics.totalTrades || 0}</p>
                    </div>

                    <div className="bg-white p-4 rounded-xl shadow-sm border">
                        <div className="flex items-center gap-2 mb-2">
                            <TrendingUp className="w-4 h-4 text-green-600" />
                            <span className="text-sm text-gray-600">Wins</span>
                        </div>
                        <p className="text-2xl font-bold text-green-600">{metrics.winCount || 0}</p>
                    </div>

                    <div className="bg-white p-4 rounded-xl shadow-sm border">
                        <div className="flex items-center gap-2 mb-2">
                            <TrendingDown className="w-4 h-4 text-red-600" />
                            <span className="text-sm text-gray-600">Losses</span>
                        </div>
                        <p className="text-2xl font-bold text-red-600">{metrics.lossCount || 0}</p>
                    </div>

                    <div className="bg-white p-4 rounded-xl shadow-sm border">
                        <div className="flex items-center gap-2 mb-2">
                            <Target className="w-4 h-4 text-purple-600" />
                            <span className="text-sm text-gray-600">Win Rate</span>
                        </div>
                        <p className="text-2xl font-bold text-purple-600">{formatNumber(metrics.winRate || 0, 1)}%</p>
                    </div>

                    <div className="bg-white p-4 rounded-xl shadow-sm border">
                        <div className="flex items-center gap-2 mb-2">
                            <DollarSign className="w-4 h-4 text-blue-600" />
                            <span className="text-sm text-gray-600">Total PnL</span>
                        </div>
                        <p className={`text-2xl font-bold ${(metrics.totalPnL || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatCurrency(metrics.totalPnL || 0)}
                        </p>
                    </div>

                    <div className="bg-white p-4 rounded-xl shadow-sm border">
                        <div className="flex items-center gap-2 mb-2">
                            <Activity className="w-4 h-4 text-indigo-600" />
                            <span className="text-sm text-gray-600">Avg Win</span>
                        </div>
                        <p className="text-2xl font-bold text-green-600">{formatCurrency(metrics.avgWin || 0)}</p>
                    </div>

                    <div className="bg-white p-4 rounded-xl shadow-sm border">
                        <div className="flex items-center gap-2 mb-2">
                            <Activity className="w-4 h-4 text-indigo-600" />
                            <span className="text-sm text-gray-600">Avg Loss</span>
                        </div>
                        <p className="text-2xl font-bold text-red-600">{formatCurrency(metrics.avgLoss || 0)}</p>
                    </div>
                </div>

                {/* Main Content Grid */}
                <div className="grid lg:grid-cols-2 gap-8">
                    {/* Opening Orders */}
                    <div className="bg-white rounded-xl shadow-sm border">
                        <div className="p-6 border-b border-gray-100">
                            <div className="flex items-center gap-2">
                                <ArrowUp className="w-5 h-5 text-green-600" />
                                <h2 className="text-xl font-semibold text-gray-900">Position Opening Orders</h2>
                                <span className="bg-green-100 text-green-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                                    {openingOrders.length}
                                </span>
                            </div>
                        </div>
                        <div className="p-6 max-h-96 overflow-y-auto">
                            {openingOrders.length === 0 ? (
                                <div className="text-center py-8 text-gray-500">
                                    No opening orders
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {openingOrders.slice().reverse().map((order, index) => (
                                        <div key={index} className="border border-green-200 rounded-lg p-4 bg-green-50">
                                            <div className="flex justify-between items-start mb-3">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-gray-900">{order.symbol}</span>
                                                    <span className={`px-2 py-1 rounded text-xs font-medium ${getSideColor(order.side)}`}>
                                                        {order.side?.toUpperCase()}
                                                    </span>
                                                    <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">
                                                        {order.orderStatus}
                                                    </span>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-xs text-gray-500">
                                                        {order.updatedTime ? new Date(parseInt(order.updatedTime)).toLocaleTimeString() : '-'}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-3 gap-4 text-sm">
                                                <div>
                                                    <p className="text-gray-600">Quantity</p>
                                                    <p className="font-semibold">{formatNumber(order.cumExecQty || order.qty)}</p>
                                                </div>
                                                <div>
                                                    <p className="text-gray-600">Price</p>
                                                    <p className="font-semibold">{formatCurrency(order.avgPrice || order.price)}</p>
                                                </div>
                                                <div>
                                                    <p className="text-gray-600">Fees</p>
                                                    <p className="font-semibold text-red-600">{formatCurrency(order.cumExecFee || 0)}</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Closing Orders */}
                    <div className="bg-white rounded-xl shadow-sm border">
                        <div className="p-6 border-b border-gray-100">
                            <div className="flex items-center gap-2">
                                <ArrowDown className="w-5 h-5 text-red-600" />
                                <h2 className="text-xl font-semibold text-gray-900">Position Closing Orders</h2>
                                <span className="bg-red-100 text-red-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                                    {closingOrders.length}
                                </span>
                            </div>
                        </div>
                        <div className="p-6 max-h-96 overflow-y-auto">
                            {closingOrders.length === 0 ? (
                                <div className="text-center py-8 text-gray-500">
                                    No closing orders
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {closingOrders.slice().reverse().map((order, index) => (
                                        <div key={index} className="border border-red-200 rounded-lg p-4 bg-red-50">
                                            <div className="flex justify-between items-start mb-3">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-gray-900">{order.symbol}</span>
                                                    <span className={`px-2 py-1 rounded text-xs font-medium ${getSideColor(order.side)}`}>
                                                        {order.side?.toUpperCase()}
                                                    </span>
                                                    <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-medium">
                                                        {order.orderStatus}
                                                    </span>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-xs text-gray-500">
                                                        {order.updatedTime ? new Date(parseInt(order.updatedTime)).toLocaleTimeString() : '-'}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-4 gap-4 text-sm">
                                                <div>
                                                    <p className="text-gray-600">Quantity</p>
                                                    <p className="font-semibold">{formatNumber(order.cumExecQty || order.qty)}</p>
                                                </div>
                                                <div>
                                                    <p className="text-gray-600">Price</p>
                                                    <p className="font-semibold">{formatCurrency(order.avgPrice || order.price)}</p>
                                                </div>
                                                <div>
                                                    <p className="text-gray-600">Fees</p>
                                                    <p className="font-semibold text-red-600">{formatCurrency(order.cumExecFee || 0)}</p>
                                                </div>
                                                <div>
                                                    <p className="text-gray-600">PnL</p>
                                                    <p className={`font-semibold ${parseFloat(order.closedPnl || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                        {formatCurrency(order.closedPnl || 0)}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Completed Trades Table */}
                <div className="mt-8 bg-white rounded-xl shadow-sm border">
                    <div className="p-6 border-b border-gray-100">
                        <div className="flex items-center gap-2">
                            <BarChart3 className="w-5 h-5 text-blue-600" />
                            <h2 className="text-xl font-semibold text-gray-900">Completed Trades</h2>
                            <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                                {completedTrades.length}
                            </span>
                        </div>
                    </div>
                    <div className="p-6">
                        {completedTrades.length === 0 ? (
                            <div className="text-center py-8 text-gray-500">
                                No completed trades yet
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead className="border-b border-gray-200">
                                        <tr className="text-left text-sm text-gray-600">
                                            <th className="pb-3 font-medium">Symbol</th>
                                            <th className="pb-3 font-medium">Time</th>
                                            <th className="pb-3 font-medium">Entry Price</th>
                                            <th className="pb-3 font-medium">Exit Price</th>
                                            <th className="pb-3 font-medium">Realized PnL</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {completedTrades.slice().reverse().map((trade, index) => (
                                            <tr key={index} className="text-sm hover:bg-gray-50">
                                                <td className="py-3 font-medium text-gray-900">{trade.symbol}</td>
                                                <td className="py-3 text-gray-600">
                                                    {trade.time ? new Date(parseInt(trade.time)).toLocaleString() : '-'}
                                                </td>
                                                <td className="py-3 font-medium">{formatCurrency(trade.EntryPrice)}</td>
                                                <td className="py-3 font-medium">{formatCurrency(trade.ExitPrice)}</td>
                                                <td className={`py-3 font-bold ${trade.realizedPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                    {formatCurrency(trade.realizedPnL)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>

                {/* Live Positions Section */}
                <div className="mt-8 bg-white rounded-xl shadow-sm border">
                    <div className="p-6 border-b border-gray-100">
                        <div className="flex items-center gap-2">
                            <Activity className="w-5 h-5 text-purple-600" />
                            <h2 className="text-xl font-semibold text-gray-900">Live Positions</h2>
                            <span className="bg-purple-100 text-purple-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                                {positions.length}
                            </span>
                        </div>
                    </div>
                    <div className="p-6">
                        {positions.length === 0 ? (
                            <div className="text-center py-8 text-gray-500">
                                No active positions
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead className="border-b border-gray-200">
                                        <tr className="text-left text-sm text-gray-600">
                                            <th className="pb-3 font-medium">Symbol</th>
                                            <th className="pb-3 font-medium">Side</th>
                                            <th className="pb-3 font-medium">Size</th>
                                            <th className="pb-3 font-medium">Entry Price</th>
                                            <th className="pb-3 font-medium">Mark Price</th>
                                            <th className="pb-3 font-medium">Unrealized PnL</th>
                                            <th className="pb-3 font-medium">ROE %</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {positions.map((position, index) => (
                                            <tr key={index} className="text-sm hover:bg-gray-50">
                                                <td className="py-3 font-medium text-gray-900">{position.symbol}</td>
                                                <td className="py-3">
                                                    <span className={`px-2 py-1 rounded text-xs font-medium ${getSideColor(position.side)}`}>
                                                        {position.side?.toUpperCase()}
                                                    </span>
                                                </td>
                                                <td className="py-3 font-medium">{formatNumber(position.size)}</td>
                                                <td className="py-3">{formatCurrency(position.avgPrice)}</td>
                                                <td className="py-3">{formatCurrency(position.markPrice)}</td>
                                                <td className={`py-3 font-bold ${parseFloat(position.unrealisedPnl || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                    {formatCurrency(position.unrealisedPnl)}
                                                </td>
                                                <td className={`py-3 font-bold ${parseFloat(position.unrealisedPnl || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                    {formatNumber(parseFloat(position.unrealisedPnl || 0) / parseFloat(position.avgPrice || 1) * 100, 2)}%
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>

                {/* System Status and Statistics */}
                <div className="mt-8 grid lg:grid-cols-3 gap-6">
                    {/* Connection Statistics */}
                    <div className="bg-white rounded-xl shadow-sm border p-6">
                        <div className="flex items-center gap-2 mb-4">
                            <Zap className="w-5 h-5 text-orange-600" />
                            <h3 className="text-lg font-semibold text-gray-900">Connection Stats</h3>
                        </div>
                        <div className="space-y-3">
                            <div className="flex justify-between">
                                <span className="text-gray-600">Status</span>
                                <span className={`font-medium ${connectionStatus === 'connected' ? 'text-green-600' : 'text-red-600'}`}>
                                    {connectionStatus.charAt(0).toUpperCase() + connectionStatus.slice(1)}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-600">Reconnect Attempts</span>
                                <span className="font-medium">{reconnectAttemptRef.current}/{maxReconnectAttempts}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-600">Last Update</span>
                                <span className="font-medium text-sm">
                                    {lastUpdate ? lastUpdate.toLocaleTimeString() : 'Never'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Order Processing Stats */}
                    <div className="bg-white rounded-xl shadow-sm border p-6">
                        <div className="flex items-center gap-2 mb-4">
                            <Volume2 className="w-5 h-5 text-blue-600" />
                            <h3 className="text-lg font-semibold text-gray-900">Processing Stats</h3>
                        </div>
                        <div className="space-y-3">
                            <div className="flex justify-between">
                                <span className="text-gray-600">Opening Orders</span>
                                <span className="font-medium">{openingOrders.length}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-600">Closing Orders</span>
                                <span className="font-medium">{closingOrders.length}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-600">Pending Orders</span>
                                <span className="font-medium">{tempOrders ? 1 : 0}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-600">Active Positions</span>
                                <span className="font-medium">{positions.length}</span>
                            </div>
                        </div>
                    </div>

                    {/* Performance Summary */}
                    <div className="bg-white rounded-xl shadow-sm border p-6">
                        <div className="flex items-center gap-2 mb-4">
                            <Target className="w-5 h-5 text-indigo-600" />
                            <h3 className="text-lg font-semibold text-gray-900">Performance</h3>
                        </div>
                        <div className="space-y-3">
                            <div className="flex justify-between">
                                <span className="text-gray-600">Best Trade</span>
                                <span className="font-medium text-green-600">
                                    {completedTrades.length > 0 ?
                                        formatCurrency(Math.max(...completedTrades.map(t => t.realizedPnL))) :
                                        '$0.00'}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-600">Worst Trade</span>
                                <span className="font-medium text-red-600">
                                    {completedTrades.length > 0 ?
                                        formatCurrency(Math.min(...completedTrades.map(t => t.realizedPnL))) :
                                        '$0.00'}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-600">Profit Factor</span>
                                <span className="font-medium">
                                    {metrics.avgLoss > 0 ?
                                        formatNumber(Math.abs(metrics.avgWin) / Math.abs(metrics.avgLoss), 2) :
                                        'N/A'}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-600">Total Volume</span>
                                <span className="font-medium">
                                    {formatNumber(openingOrders.reduce((acc, order) =>
                                        acc + parseFloat(order.cumExecValue || 0), 0))}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="mt-8 text-center text-sm text-gray-500">
                    <p>Real-time trading dashboard powered by Bybit WebSocket API</p>
                    <p className="mt-1">© 2025 Trading Dashboard - Monitor your trades in real-time</p>
                </div>
            </div>
        </div>
    );
};

export default TradingDashboard;