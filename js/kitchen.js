// グローバル変数
let supabase = null;
let orders = [];
let menuItems = [];
let realtimeChannel = null;
let lastNotificationTime = 0;
let connectionStatus = 'offline';

// ページ読み込み時の初期化
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Supabase CDNの読み込みを待つ
        await loadSupabaseSDK();
        
        // Supabase初期化
        supabase = window.initSupabase();
        if (!supabase) {
            showError('システムエラーが発生しました');
            return;
        }
        
        // 初期データ読み込み
        await loadInitialData();
        
        // リアルタイム機能開始
        setupRealtimeSubscription();
        
        // UI初期化
        initializeUI();
        
        showSuccess('厨房システムが開始されました');
        
    } catch (error) {
        console.error('初期化エラー:', error);
        showError('システムの初期化に失敗しました');
    }
});

// Supabase SDKの読み込み
async function loadSupabaseSDK() {
    return new Promise((resolve) => {
        if (window.supabase) {
            resolve();
            return;
        }
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
        script.onload = resolve;
        document.head.appendChild(script);
    });
}

// 初期データ読み込み
async function loadInitialData() {
    try {
        // メニューアイテム読み込み
        const { data: menuData, error: menuError } = await supabase
            .from('menu_items')
            .select('*');
        if (menuError) throw menuError;
        menuItems = menuData;
        
        // 注文データ読み込み（今日の注文のみ）
        const today = new Date().toISOString().split('T')[0];
        const { data: orderData, error: orderError } = await supabase
            .from('orders')
            .select(`
                *,
                order_items (
                    *,
                    menu_item_id
                )
            `)
            .gte('created_at', today)
            .order('created_at', { ascending: false });
            
        if (orderError) throw orderError;
        
        // 注文データにメニュー情報を追加
        orders = orderData.map(order => ({
            ...order,
            order_items: order.order_items.map(item => ({
                ...item,
                menu_item: menuItems.find(menu => menu.id === item.menu_item_id) || {}
            }))
        }));
        
        renderAllOrders();
        updateConnectionStatus('online');
        
    } catch (error) {
        console.error('データ読み込みエラー:', error);
        updateConnectionStatus('offline');
        throw error;
    }
}

// リアルタイム機能の設定
function setupRealtimeSubscription() {
    // 既存のチャンネルがあれば削除
    if (realtimeChannel) {
        supabase.removeChannel(realtimeChannel);
    }
    
    // 新しいチャンネルを作成
    realtimeChannel = supabase
        .channel('kitchen_orders')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'orders'
        }, handleNewOrder)
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'orders'
        }, handleOrderUpdate)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'order_items'
        }, handleNewOrderItem)
        .subscribe((status) => {
            console.log('リアルタイム接続ステータス:', status);
            updateConnectionStatus(status === 'SUBSCRIBED' ? 'online' : 'offline');
        });
}

// 新規注文の処理
async function handleNewOrder(payload) {
    console.log('新規注文を受信:', payload);
    
    try {
        // 注文詳細を取得
        const { data: orderData, error } = await supabase
            .from('orders')
            .select(`
                *,
                order_items (
                    *,
                    menu_item_id
                )
            `)
            .eq('id', payload.new.id)
            .single();
            
        if (error) throw error;
        
        // メニュー情報を追加
        const orderWithMenu = {
            ...orderData,
            order_items: orderData.order_items.map(item => ({
                ...item,
                menu_item: menuItems.find(menu => menu.id === item.menu_item_id) || {}
            }))
        };
        
        // 注文リストに追加
        orders.unshift(orderWithMenu);
        
        // UI更新
        renderAllOrders();
        
        // 通知表示（新規注文のみ）
        if (orderData.status === 'pending') {
            showNewOrderNotification(orderWithMenu);
        }
        
    } catch (error) {
        console.error('新規注文処理エラー:', error);
    }
}

// 注文更新の処理
function handleOrderUpdate(payload) {
    console.log('注文更新を受信:', payload);
    
    // 注文リストを更新
    const orderIndex = orders.findIndex(order => order.id === payload.new.id);
    if (orderIndex !== -1) {
        orders[orderIndex] = { ...orders[orderIndex], ...payload.new };
        renderAllOrders();
    }
}

// 注文アイテム追加の処理
async function handleNewOrderItem(payload) {
    console.log('注文アイテム追加を受信:', payload);
    
    // 該当注文を見つけて更新
    const orderIndex = orders.findIndex(order => order.id === payload.new.order_id);
    if (orderIndex !== -1) {
        // 最新の注文データを再取得
        await loadInitialData();
    }
}

// 新規注文通知の表示
function showNewOrderNotification(order) {
    const now = Date.now();
    // 連続通知を防ぐ（3秒以内の重複通知をブロック）
    if (now - lastNotificationTime < 3000) return;
    lastNotificationTime = now;
    
    // 音声通知
    playNotificationSound();
    
    // 視覚通知
    const notification = document.getElementById('notification');
    const notificationText = document.querySelector('.notification-text');
    notificationText.textContent = `テーブル ${order.table_id} から新しい注文が入りました！`;
    
    notification.style.display = 'block';
    setTimeout(() => {
        notification.style.display = 'none';
    }, 4000);
}

// 通知音再生
function playNotificationSound() {
    const audio = document.getElementById('notificationSound');
    audio.currentTime = 0;
    audio.play().catch(e => console.log('音声再生エラー:', e));
}

// 全注文の表示
function renderAllOrders() {
    const pendingOrders = orders.filter(order => order.status === 'pending');
    const preparingOrders = orders.filter(order => order.status === 'preparing');
    const completedOrders = orders.filter(order => 
        order.status === 'completed' || order.status === 'confirmed'
    );
    
    renderOrdersInSection('pendingOrders', pendingOrders, 'pending');
    renderOrdersInSection('preparingOrders', preparingOrders, 'preparing');
    renderOrdersInSection('completedOrders', completedOrders, 'completed');
    
    // カウント更新
    document.getElementById('pendingCount').textContent = pendingOrders.length;
    document.getElementById('preparingCount').textContent = preparingOrders.length;
    document.getElementById('completedCount').textContent = completedOrders.length;
}

// セクション別注文表示
function renderOrdersInSection(sectionId, orderList, status) {
    const section = document.getElementById(sectionId);
    
    if (orderList.length === 0) {
        section.innerHTML = `
            <div class="no-orders">
                <div class="no-orders-icon">✅</div>
                <div>${getEmptyMessage(status)}</div>
            </div>
        `;
        return;
    }
    
    section.innerHTML = orderList.map(order => createOrderCard(order, status)).join('');
}

// 注文カードのHTML生成
function createOrderCard(order, status) {
    const createdTime = new Date(order.created_at).toLocaleTimeString('ja-JP', {
        hour: '2-digit',
        minute: '2-digit'
    });
    
    const statusClass = status === 'pending' ? 'new-order' : status;
    
    return `
        <div class="order-card ${statusClass}" onclick="showOrderDetails(${order.id})">
            <div class="order-header">
                <div class="order-number">注文 #${order.id}</div>
                <div class="table-info">テーブル ${order.table_id}</div>
            </div>
            <div class="order-time">${createdTime}</div>
            
            <div class="order-items">
                ${order.order_items.map(item => `
                    <div class="order-item">
                        <span class="item-name">${item.menu_item.name || '不明な商品'}</span>
                        <span class="item-quantity">×${item.quantity}</span>
                    </div>
                `).join('')}
            </div>
            
            <div class="order-total">合計: ¥${order.total_amount.toLocaleString()}</div>
            
            <div class="order-actions" onclick="event.stopPropagation()">
                ${getActionButtons(order, status)}
            </div>
        </div>
    `;
}

// ステータス別アクションボタン
function getActionButtons(order, status) {
    switch (status) {
        case 'pending':
            return `
                <button class="action-btn btn-confirm" onclick="updateOrderStatus(${order.id}, 'confirmed')">
                    確認
                </button>
                <button class="action-btn btn-start" onclick="updateOrderStatus(${order.id}, 'preparing')">
                    調理開始
                </button>
                <button class="action-btn btn-cancel" onclick="updateOrderStatus(${order.id}, 'cancelled')">
                    キャンセル
                </button>
            `;
        case 'preparing':
            return `
                <button class="action-btn btn-complete" onclick="updateOrderStatus(${order.id}, 'completed')">
                    完成
                </button>
            `;
        case 'completed':
            return `
                <button class="action-btn btn-cancel" onclick="updateOrderStatus(${order.id}, 'preparing')">
                    調理中に戻す
                </button>
            `;
        default:
            return '';
    }
}

// 注文ステータス更新
async function updateOrderStatus(orderId, newStatus) {
    try {
        const { error } = await supabase
            .from('orders')
            .update({ 
                status: newStatus,
                updated_at: new Date().toISOString()
            })
            .eq('id', orderId);
            
        if (error) throw error;
        
        showSuccess(`注文ステータスを「${getStatusText(newStatus)}」に更新しました`);
        
    } catch (error) {
        console.error('ステータス更新エラー:', error);
        showError('ステータスの更新に失敗しました');
    }
}

// 注文詳細モーダル表示
function showOrderDetails(orderId) {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    
    const modal = document.getElementById('orderModal');
    const details = document.getElementById('orderDetails');
    const actions = document.getElementById('modalActions');
    
    const createdTime = new Date(order.created_at).toLocaleString('ja-JP');
    
    details.innerHTML = `
        <div style="margin-bottom: 20px;">
            <h4>注文 #${order.id}</h4>
            <p><strong>テーブル:</strong> ${order.table_id}</p>
            <p><strong>注文時刻:</strong> ${createdTime}</p>
            <p><strong>ステータス:</strong> ${getStatusText(order.status)}</p>
        </div>
        
        <div style="margin-bottom: 20px;">
            <h4>注文内容</h4>
            ${order.order_items.map(item => `
                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee;">
                    <span>${item.menu_item.name || '不明な商品'}</span>
                    <span>¥${item.price} × ${item.quantity} = ¥${(item.price * item.quantity).toLocaleString()}</span>
                </div>
            `).join('')}
        </div>
        
        <div style="text-align: right; font-size: 18px; font-weight: bold;">
            合計: ¥${order.total_amount.toLocaleString()}
        </div>
    `;
    
    actions.innerHTML = getActionButtons(order, order.status);
    modal.style.display = 'block';
}

// モーダルを閉じる
function closeOrderModal() {
    document.getElementById('orderModal').style.display = 'none';
}

// UI初期化
function initializeUI() {
    // 現在時刻表示
    updateCurrentTime();
    setInterval(updateCurrentTime, 1000);
    
    // モーダルクリック外し処理
    const modal = document.getElementById('orderModal');
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeOrderModal();
        }
    });
}

// 現在時刻更新
function updateCurrentTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('ja-JP', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    document.getElementById('currentTime').textContent = timeString;
}

// 接続ステータス更新
function updateConnectionStatus(status) {
    connectionStatus = status;
    const statusElement = document.getElementById('connectionStatus');
    const indicator = statusElement.querySelector('.status-indicator');
    
    if (status === 'online') {
        indicator.className = 'status-indicator online';
        statusElement.innerHTML = '<span class="status-indicator online"></span>接続中';
    } else {
        indicator.className = 'status-indicator offline';
        statusElement.innerHTML = '<span class="status-indicator offline"></span>接続エラー';
    }
}

// ユーティリティ関数
function getStatusText(status) {
    const statusMap = {
        'pending': '新規',
        'confirmed': '確認済み',
        'preparing': '調理中',
        'completed': '完成',
        'cancelled': 'キャンセル'
    };
    return statusMap[status] || status;
}

function getEmptyMessage(status) {
    const messageMap = {
        'pending': '新規注文はありません',
        'preparing': '調理中の注文はありません',
        'completed': '完了済みの注文はありません'
    };
    return messageMap[status] || '注文はありません';
}

function showSuccess(message) {
    console.log('✅', message);
    // 必要に応じてトースト通知を実装
}

function showError(message) {
    console.error('❌', message);
    // 必要に応じてエラー通知を実装
}

// グローバル関数として公開
window.updateOrderStatus = updateOrderStatus;
window.showOrderDetails = showOrderDetails;
window.closeOrderModal = closeOrderModal;