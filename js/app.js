// グローバル変数
let supabase = null;
let cart = [];
let currentCategory = null;
let categories = [];
let menuItems = [];
let selectedTable = null;
let selectedPaymentMethod = null;

// ページ読み込み時の初期化
document.addEventListener('DOMContentLoaded', async () => {
    // Supabase CDNの読み込みを待つ
    await loadSupabaseSDK();
    
    // Supabase初期化
    supabase = window.initSupabase();
    if (!supabase) {
        showToast('システムエラーが発生しました', 'error');
        return;
    }
    
    // テーブル選択モーダルを表示
    showTableSelectModal();
});

// Supabase SDKの読み込み
async function loadSupabaseSDK() {
    return new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
        script.onload = resolve;
        document.head.appendChild(script);
    });
}

// テーブル選択モーダルの表示
function showTableSelectModal() {
    const modal = document.getElementById('tableSelectModal');
    const tableGrid = document.getElementById('tableGrid');
    
    tableGrid.innerHTML = '';
    window.APP_CONFIG.tables.forEach(table => {
        const tableItem = document.createElement('div');
        tableItem.className = 'table-item';
        tableItem.textContent = table;
        tableItem.onclick = () => selectTable(table);
        tableGrid.appendChild(tableItem);
    });
    
    modal.style.display = 'block';
}

// テーブル選択
async function selectTable(tableNumber) {
    selectedTable = tableNumber;
    document.getElementById('tableNumber').textContent = tableNumber;
    document.getElementById('tableSelectModal').style.display = 'none';
    
    // データ読み込み
    await loadCategories();
    await loadMenuItems();
    
    showToast(`テーブル ${tableNumber} を選択しました`);
}

// カテゴリー読み込み
async function loadCategories() {
    try {
        const { data, error } = await supabase
            .from('categories')
            .select('*')
            .order('display_order');
            
        if (error) throw error;
        
        categories = data;
        renderCategoryTabs();
    } catch (error) {
        console.error('カテゴリー読み込みエラー:', error);
        showToast('カテゴリーの読み込みに失敗しました', 'error');
    }
}

// メニューアイテム読み込み
async function loadMenuItems() {
    try {
        const { data, error } = await supabase
            .from('menu_items')
            .select('*')
            .eq('is_available', true)
            .order('id');
            
        if (error) throw error;
        
        menuItems = data;
        if (categories.length > 0) {
            showCategory(categories[0].id);
        }
    } catch (error) {
        console.error('メニュー読み込みエラー:', error);
        showToast('メニューの読み込みに失敗しました', 'error');
    }
}

// カテゴリータブの表示
function renderCategoryTabs() {
    const categoryTabs = document.getElementById('categoryTabs');
    categoryTabs.innerHTML = '';
    
    categories.forEach((category, index) => {
        const tab = document.createElement('button');
        tab.className = 'category-tab';
        if (category.is_dog_menu) {
            tab.className += ' dog-menu';
        }
        if (index === 0) {
            tab.className += ' active';
        }
        tab.textContent = category.is_dog_menu ? `🐕 ${category.name}` : category.name;
        tab.onclick = () => showCategory(category.id);
        categoryTabs.appendChild(tab);
    });
}

// カテゴリー表示
function showCategory(categoryId) {
    currentCategory = categoryId;
    
    // タブのアクティブ状態更新
    const tabs = document.querySelectorAll('.category-tab');
    tabs.forEach((tab, index) => {
        if (categories[index].id === categoryId) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });
    
    renderMenuItems();
}

// メニューアイテムの表示
function renderMenuItems() {
    const menuGrid = document.getElementById('menuGrid');
    menuGrid.innerHTML = '';
    
    const categoryItems = menuItems.filter(item => item.category_id === currentCategory);
    
    categoryItems.forEach(item => {
        const menuItem = document.createElement('div');
        menuItem.className = item.is_dog_item ? 'menu-item dog-item' : 'menu-item';
        menuItem.onclick = () => addToCart(item);
        
        menuItem.innerHTML = `
            ${item.is_dog_item ? '<div class="dog-badge">🐕 犬用</div>' : ''}
            <div class="menu-item-name">${item.name}</div>
            ${item.description ? `<div class="menu-item-description">${item.description}</div>` : ''}
            <div class="menu-item-price">¥${item.price.toLocaleString()}</div>
        `;
        
        menuGrid.appendChild(menuItem);
    });
}

// カートに追加
function addToCart(item) {
    const existingItem = cart.find(cartItem => cartItem.id === item.id);
    
    if (existingItem) {
        existingItem.quantity++;
    } else {
        cart.push({ ...item, quantity: 1 });
    }
    
    showToast(`${item.name}をカートに追加しました`);
    renderCart();
    updateTotal();
}

// カート表示
function renderCart() {
    const cartItems = document.getElementById('cartItems');
    cartItems.innerHTML = '';
    
    if (cart.length === 0) {
        cartItems.innerHTML = `
            <div class="cart-empty">
                <div class="cart-empty-icon">🛒</div>
                <div>カートは空です</div>
            </div>
        `;
        document.getElementById('submitBtn').disabled = true;
        return;
    }
    
    document.getElementById('submitBtn').disabled = false;
    
    cart.forEach(item => {
        const cartItem = document.createElement('div');
        cartItem.className = 'cart-item';
        cartItem.innerHTML = `
            <div class="cart-item-info">
                <div class="cart-item-name">${item.name}${item.is_dog_item ? ' 🐕' : ''}</div>
                <div class="cart-item-price">¥${item.price} × ${item.quantity}</div>
                <div class="cart-item-total">¥${(item.price * item.quantity).toLocaleString()}</div>
            </div>
            <div class="quantity-controls">
                <button class="quantity-btn" onclick="updateQuantity(${item.id}, -1)">-</button>
                <span class="quantity-display">${item.quantity}</span>
                <button class="quantity-btn" onclick="updateQuantity(${item.id}, 1)">+</button>
                <button class="quantity-btn remove" onclick="removeItem(${item.id})">✕</button>
            </div>
        `;
        cartItems.appendChild(cartItem);
    });
}

// 数量更新
function updateQuantity(itemId, change) {
    const item = cart.find(cartItem => cartItem.id === itemId);
    if (item) {
        item.quantity += change;
        if (item.quantity <= 0) {
            cart = cart.filter(cartItem => cartItem.id !== itemId);
        }
        renderCart();
        updateTotal();
    }
}

// アイテム削除
function removeItem(itemId) {
    cart = cart.filter(cartItem => cartItem.id !== itemId);
    renderCart();
    updateTotal();
}

// 合計更新
function updateTotal() {
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const tax = Math.floor(subtotal * window.APP_CONFIG.taxRate);
    const total = subtotal + tax;
    
    document.getElementById('subtotal').textContent = `¥${subtotal.toLocaleString()}`;
    document.getElementById('tax').textContent = `¥${tax.toLocaleString()}`;
    document.getElementById('total').textContent = `¥${total.toLocaleString()}`;
}

// カートクリア
function clearCart() {
    if (cart.length > 0 && confirm('カートの内容をすべて削除しますか？')) {
        cart = [];
        renderCart();
        updateTotal();
    }
}

// 注文送信
async function submitOrder() {
    if (cart.length === 0) return;
    
    const submitBtn = document.getElementById('submitBtn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<div class="loading"></div>';
    
    try {
        const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const tax = Math.floor(subtotal * window.APP_CONFIG.taxRate);
        const total = subtotal + tax;
        
        // 注文データ作成
        const { data: orderData, error: orderError } = await supabase
            .from('orders')
            .insert([{
                table_id: selectedTable,
                status: window.APP_CONFIG.orderStatus.PENDING,
                total_amount: total
            }])
            .select()
            .single();
            
        if (orderError) throw orderError;
        
        // 注文詳細データ作成
        const orderItems = cart.map(item => ({
            order_id: orderData.id,
            menu_item_id: item.id,
            quantity: item.quantity,
            price: item.price
        }));
        
        const { error: itemsError } = await supabase
            .from('order_items')
            .insert(orderItems);
            
        if (itemsError) throw itemsError;
        
        showToast('ご注文を承りました！');
        
        // 会計モーダル表示
        setTimeout(() => {
            document.getElementById('paymentModal').style.display = 'block';
        }, 500);
        
    } catch (error) {
        console.error('注文エラー:', error);
        showToast('注文の送信に失敗しました', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '注文する';
    }
}

// 支払い方法選択
function selectPayment(method) {
    selectedPaymentMethod = method;
    const options = document.querySelectorAll('.payment-option');
    options.forEach(option => option.classList.remove('selected'));
    event.currentTarget.classList.add('selected');
}

// 支払い処理
function proceedToPayment() {
    if (!selectedPaymentMethod) {
        alert('支払い方法を選択してください');
        return;
    }
    
    if (selectedPaymentMethod === 'individual') {
        showToast('個別会計を選択しました。スタッフがお伺いします。');
    } else {
        showToast('まとめて会計を選択しました。レジでお支払いください。');
    }
    
    closePaymentModal();
    cart = [];
    renderCart();
    updateTotal();
}

// 支払いモーダルを閉じる
function closePaymentModal() {
    document.getElementById('paymentModal').style.display = 'none';
    selectedPaymentMethod = null;
}

// スタッフ呼出
function callStaff() {
    showToast('スタッフを呼び出しました');
    // 実際の実装では、ここでスタッフに通知を送信
}

// トースト表示
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.style.backgroundColor = type === 'error' ? '#e74c3c' : '#27ae60';
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// グローバル関数として公開（HTMLから呼び出すため）
window.showCategory = showCategory;
window.addToCart = addToCart;
window.updateQuantity = updateQuantity;
window.removeItem = removeItem;
window.clearCart = clearCart;
window.submitOrder = submitOrder;
window.selectPayment = selectPayment;
window.proceedToPayment = proceedToPayment;
window.closePaymentModal = closePaymentModal;
window.callStaff = callStaff;