// Supabase設定
// このファイルはテンプレートです。GitHub Actionsでビルド時に
// 実際の値が環境変数から注入されます
const SUPABASE_CONFIG = {
    url: '${SUPABASE_URL}',
    anonKey: '${SUPABASE_ANON_KEY}'
};

// API設定
const API_CONFIG = {
    endpoint: '${API_ENDPOINT}'
};

// アプリケーション設定
const APP_CONFIG = {
    restaurantName: 'レストラン名',
    taxRate: 0.10,  // 消費税率10%
    orderTimeout: 30 * 60 * 1000,  // 30分でタイムアウト
    
    // テーブル設定
    tables: [
        'A-1', 'A-2', 'A-3', 'A-4', 'A-5',
        'B-1', 'B-2', 'B-3'
    ],
    
    // 注文ステータス
    orderStatus: {
        PENDING: 'pending',
        CONFIRMED: 'confirmed',
        PREPARING: 'preparing',
        COMPLETED: 'completed',
        CANCELLED: 'cancelled'
    }
};

// Supabaseクライアントの初期化関数
function initSupabase() {
    if (typeof window.supabase === 'undefined') {
        console.error('Supabase JavaScript library not loaded');
        return null;
    }
    
    return window.supabase.createClient(
        SUPABASE_CONFIG.url,
        SUPABASE_CONFIG.anonKey
    );
}

// グローバル変数として公開
window.SUPABASE_CONFIG = SUPABASE_CONFIG;
window.API_CONFIG = API_CONFIG;
window.APP_CONFIG = APP_CONFIG;
window.initSupabase = initSupabase;