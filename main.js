/*
    main.js — interactive behavior for Aura landing page
    - Manages product variant & color selection
    - Renders and persists a localStorage-based cart (`aura-cart`)
    - Handles accessible cart panel and mobile nav focus traps

    Keep changes minimal and local — this file is an immediately-invoked
    function expression (IIFE) to avoid leaking globals.
*/
 (function(){
    'use strict';

    /*
        CONFIG
        - `images`: a simple mapping of semantic slugs to image paths. These paths
          should be relative to the site root (or absolute URLs). When you add new
          color variants below, use the same slug here to provide a sensible
          default mapping for modules that reference CONFIG.images.

        Example flow for adding a new color variant:
        1. Add the image file to `/images/` (e.g. `images/my-product-black.jpg`).
        2. In the `products[<key>].variants` array below add an entry with
           `{ name: 'My Black', color: '#000', image: 'images/my-product-black.jpg' }`.
        3. Optionally add a mapping in `CONFIG.images` using the slug name
           (slugify('My Black') -> 'my-black') if you want a global fallback.
    */
    const CONFIG = {
        locale: 'en-US',
        currency: 'USD',
        currencyOptions: {},
        prices: { standard: 149, pro: 199 },
        images: {
            /* mapped to the photographic sample PNG base names (no size/extension)
               The image build step will generate -320, -640, -1200 and -56 variants. */
            'matte-black': './images/AuraMatteBlack',
            'soft-white': './images/AuraSoftWhite',
            'sand': './images/AuraSand',
            'brushed-steel': './images/AuraBrushedSteel'
        }
    };
    
    /* Product catalog: multiple product versions (desk + floor) */
    const products = {
        desk: {
            title: "Aura Desk Lamp",
            subtitle: "Adaptive light built for focus.",
            support: "Automatically adjusts brightness and warmth throughout the day to reduce eye strain and maintain productivity.",
            tagline: "Best for focused work",
            price: 149,
            prices: { standard: 149, pro: 199 },
            meta: "Free shipping · 30-day returns",
            ratio: "1 / 1",
            variants: [
                { name: "Matte Black", color: "#222", image: 'images/AuraMatteBlack' },
                { name: "Soft White", color: "#f3f3f1", image: 'images/AuraSoftWhite' },
                { name: "Sand", color: "#d8c4b0", image: 'images/AuraSand' }
            ]
            ,
            features: [
                { title: 'Circadian Adjustment', description: 'Automatically adapts color temperature throughout the day to reduce eye strain.' },
                { title: 'Precision Optics', description: 'Focused beam distribution designed for long, distraction-free work sessions.' },
                { title: 'Touch & App Control', description: 'Instantly adjust brightness and warmth manually or from your phone.' }
            ]
        },

        floor: {
            title: "Aura Floor Lamp",
            subtitle: "Smart lighting for your entire room.",
            support: "Fills your space with responsive, ambient light that evolves from morning clarity to evening warmth.",
            tagline: "Best for full-room lighting",
            price: 249,
            prices: { standard: 249, pro: 299 },
            meta: "Free shipping · 30-day returns",
            ratio: "3 / 4",
            variants: [
                { name: "Matte Black", color: "#222", image: 'images/AuraMatteBlackFloor' },
                { name: "Brushed Steel", color: "#bfbfbf", image: 'images/AuraBrushedSteel' }
            ]
            ,
            features: [
                { title: 'Room-Wide Diffusion', description: 'Fills your entire space with soft, balanced ambient light.' },
                { title: 'Smart Home Ready', description: 'Seamless integration with modern smart home ecosystems.' },
                { title: 'Mood Presets', description: 'Switch from productivity mode to evening relaxation instantly.' }
            ]
        }
    };

    // Track which product is currently loaded
    let currentProductKey = 'desk';
    let currentProduct = products[currentProductKey];
    const cartKey = 'aura-cart';

    /* -----------------------------
       Utilities
    ------------------------------*/
    const $ = sel => document.querySelector(sel);
    const $all = sel => Array.from(document.querySelectorAll(sel));

    const focusableSelector = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

    function formatPrice(n){
        const opts = Object.assign({ style: 'currency', currency: CONFIG.currency }, CONFIG.currencyOptions || {});
        const locale = CONFIG.locale || 'en-US';
        return new Intl.NumberFormat(locale, opts).format(n);
    }

    // simple slug helper for generating stable keys from variant names
    function slugify(str){
        if(!str) return '';
        return String(str).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    }

    // Normalize asset paths so JS-applied URLs resolve relative to the HTML document
    // instead of the JS file. If the path is absolute (starts with /) or already
    // looks like a protocol (http/https), return as-is. Otherwise prefix with
    // `./` to make it explicitly relative to the document base.
    function resolveAsset(path){
        if(!path) return path;
        const trimmed = String(path).trim();
        if(/^(https?:)?\/\//i.test(trimmed)) return trimmed; // protocol-relative or absolute URL
        if(trimmed.startsWith('/')) return trimmed; // site-root absolute
        if(trimmed.startsWith('./') || trimmed.startsWith('../')) return trimmed; // already relative
        return './' + trimmed.replace(/^\.\//, '');
    }


    function getFocusableElements(container){
        if(!container) return [];
        return Array.from(container.querySelectorAll(focusableSelector))
            .filter(el=> (el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length));
    }

    /* -----------------------------
       Persistence (cart)
    ------------------------------*/
    function loadCart(){
        try{ return JSON.parse(localStorage.getItem(cartKey)) || {items: []}; }
        catch(e){ return {items: []}; }
    }
    function saveCart(cart){ localStorage.setItem(cartKey, JSON.stringify(cart)); }
    function calcTotal(cart){ return cart.items.reduce((s,i)=>s + (i.unitPrice * i.qty), 0); }

    /* -----------------------------
       Image Module
       Responsible for mapping swatches to image files and crossfade updates
    ------------------------------*/
    /**
     * imageModule
     * - maintains a map of slug -> image path for the currently-loaded product
     * - exposes: setProductImage(slug), getImageUrl(slug), setImageMap(map)
     * - handles crossfade when swapping images and updates accessible labels
     */
    const imageModule = (function () {
        let imageMap = Object.assign({}, CONFIG.images);

        function setProductImage(color) {
            const srcBase = imageMap[color];
            const el = $('#productImage');
            if(!el || !srcBase) return;

            // container (el) may be a wrapper div. Look for an inner <img> to set src/srcset.
            const innerImg = (el.tagName === 'IMG') ? el : el.querySelector('img');

            el.style.transition = 'opacity 220ms ease';
            el.style.opacity = 0;
            setTimeout(() => {
                const resolvedBase = resolveAsset(srcBase);

                if (innerImg && innerImg.tagName === 'IMG') {
                    try{
                        // Update <source type="image/webp"> inside a surrounding <picture> if present
                        const parentPicture = innerImg.closest('picture');
                        if(parentPicture){
                            const webpSource = parentPicture.querySelector('source[type="image/webp"]') || document.getElementById('productImageWebpSource');
                            if(webpSource){
                                webpSource.srcset = `${resolvedBase}-320.webp 320w, ${resolvedBase}-640.webp 640w, ${resolvedBase}-1200.webp 1200w`;
                            }
                        }

                        innerImg.src = `${resolvedBase}-1200.png`;
                        innerImg.srcset = `${resolvedBase}-320.png 320w, ${resolvedBase}-640.png 640w, ${resolvedBase}-1200.png 1200w`;
                        innerImg.sizes = '(max-width: 640px) 100vw, 50vw';
                    }catch(err){}
                    // set an informative alt for assistive tech
                    try{
                        const label = (color || '').toString();
                        const title = (currentProduct && currentProduct.title) ? currentProduct.title : 'Aura Product';
                        innerImg.alt = `${title} in ${label}`;
                    }catch(err){}
                } else {
                    // Fallback behavior: set background-image to a default full-size file on the container
                    el.style.setProperty('--product-image', `url("${resolvedBase}-1200.png")`);
                    try{
                        const label = (color || '').toString();
                        const title = (currentProduct && currentProduct.title) ? currentProduct.title : 'Aura Product';
                        el.setAttribute('aria-label', `${title} in ${label}`);
                    }catch(err){}
                }

                el.style.opacity = 1;
            }, 220);
        }

        function getImageUrl(color) {
            // return a small thumbnail variant for lists and cart
            const base = imageMap[color] || '';
            const resolved = resolveAsset(base || '');
            if(!resolved) return '';
            return `${resolved}-320.png`;
        }

        function setImageMap(map) {
            imageMap = Object.assign({}, map || {});
        }

        return { setProductImage, getImageUrl, setImageMap };
    })();

    /* -----------------------------
       Cart Module
       Renders cart, handles add/remove, and manages the cart panel accessibility
    ------------------------------*/
    /**
     * cartModule
     * - renders cart contents and totals
     * - persists cart to localStorage under `aura-cart`
     * - manages cart panel accessibility (focus trap, portal to body)
     */
    const cartModule = (function () {
        const cartButton = $('#cartButton');
        const cartPanel = $('#cartPanel');
        const overlay = $('#overlay');
        const cartItemsList = $('#cartItems');
        const cartTotalEl = $('#cartTotal');
        const checkoutBtn = $('#checkoutBtn');
        const continueBtn = $('#continueBtn');

        let previousFocus = null;
        let keydownHandler = null;
        let outsideClickHandler = null;
        let overlayClickHandler = null;
        let portalPlaceholder = null;
        let isPortalled = false;

        function updateCartCount() {
            const cart = loadCart();
            const count = cart.items.reduce((s, i) => s + i.qty, 0);
            const el = $('#cartCount');
            if (el) el.textContent = count;
        }

        function renderCart() {
            const cart = loadCart();
            if(!cartItemsList) return;
            cartItemsList.innerHTML = '';
            if(!cart.items.length){
                const li = document.createElement('li');
                li.className = 'cart-item';
                li.innerHTML = '<div class="meta">Your cart is empty.</div>';
                cartItemsList.appendChild(li);
            } else {
                cart.items.forEach(item => {
                    const li = document.createElement('li');
                    li.className = 'cart-item';
                    const imgSrc = imageModule.getImageUrl(item.color);
                    // create a human-friendly color label from dashed ids like "matte-black" -> "Matte Black"
                    const colorLabel = (item.color || '').split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                    li.innerHTML = `
                        <img src="${imgSrc}" alt="${item.name} in ${colorLabel}" class="cart-thumb" />
                        <div class="meta">
                            <div class="variant">${item.name}</div>
                            <div class="color">${colorLabel}</div>
                        </div>
                        <div style="display:flex;align-items:center;gap:8px;">
                            <div class="qty">${item.qty} × ${formatPrice(item.unitPrice)}</div>
                            <button class="remove" data-id="${item.id}">Remove</button>
                        </div>
                    `;
                    cartItemsList.appendChild(li);
                });
            }
            if(cartTotalEl) cartTotalEl.textContent = formatPrice(calcTotal(cart));

            // removal is handled via delegated listener attached once in attachUI
        }

        function addToCart(item) {
            const cart = loadCart();
            const existing = cart.items.find(i => i.id === item.id);
            if (existing) existing.qty += item.qty; else cart.items.push(item);
            saveCart(cart);
            updateCartCount();
        }

        function removeFromCart(id) {
            const cart = loadCart();
            const idx = cart.items.findIndex(i => i.id === id);
            if (idx >= 0) {
                cart.items.splice(idx, 1);
                saveCart(cart);
                renderCart();
                updateCartCount();
            }
        }

        function trapFocus(e) {
            if (!cartPanel) return;
            const focusables = getFocusableElements(cartPanel);
            if (!focusables.length) { e.preventDefault(); cartPanel.focus(); return; }
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }

        function openCart(){
            if(!cartPanel) return;
            // If the panel is already visible, avoid re-binding listeners — just re-render.
            const isHidden = cartPanel.getAttribute('aria-hidden') === 'true';
            if(!isHidden){ renderCart(); return; }
            // Move cart panel to document.body so it can sit above the overlay
            if(!isPortalled && cartPanel.parentNode && cartPanel.parentNode !== document.body){
                // insert a placeholder so we can restore the original position on close
                portalPlaceholder = document.createComment('cart-panel-placeholder');
                cartPanel.parentNode.insertBefore(portalPlaceholder, cartPanel);
                document.body.appendChild(cartPanel);
                cartPanel.classList.add('portal');
                isPortalled = true;
            }

            previousFocus = document.activeElement;
            cartPanel.setAttribute('aria-hidden','false');
            renderCart();
            setTimeout(()=>{
                const focusables = getFocusableElements(cartPanel);
                if(focusables.length) focusables[0].focus(); else cartPanel.focus();
            }, 0);
            keydownHandler = function(e){ if(e.key === 'Escape') closeCart(); else if(e.key === 'Tab') trapFocus(e); };
            document.addEventListener('keydown', keydownHandler);
            // bind outside-click handler using pointerdown for snappier UX
            outsideClickHandler = function(e){ const target = e.target; if(cartPanel && cartButton && !cartPanel.contains(target) && !cartButton.contains(target)) closeCart(); };
            document.addEventListener('pointerdown', outsideClickHandler);

            // Show DOM overlay (if present) and let it handle pointerdown to close the cart.
            if(overlay){
                overlay.setAttribute('aria-hidden','false');
                overlay.classList.add('active');
                overlayClickHandler = function(ev){ ev.stopPropagation(); closeCart(); };
                overlay.addEventListener('pointerdown', overlayClickHandler);
            }
        }

        function closeCart(){
            if(!cartPanel) return;
            cartPanel.setAttribute('aria-hidden','true');
            if(keydownHandler) document.removeEventListener('keydown', keydownHandler);
            keydownHandler = null;
            // unbind outside-click when closing so clicks no longer route through
            if(outsideClickHandler){ document.removeEventListener('pointerdown', outsideClickHandler); outsideClickHandler = null; }

            // Hide DOM overlay and remove its listener
            if(overlay){
                overlay.setAttribute('aria-hidden','true');
                overlay.classList.remove('active');
                if(overlayClickHandler){ overlay.removeEventListener('pointerdown', overlayClickHandler); overlayClickHandler = null; }
            }

            // If we moved the cartPanel into body, restore it to its original location
            if(isPortalled){
                cartPanel.classList.remove('portal');
                if(portalPlaceholder && portalPlaceholder.parentNode){
                    portalPlaceholder.parentNode.insertBefore(cartPanel, portalPlaceholder);
                    portalPlaceholder.parentNode.removeChild(portalPlaceholder);
                }
                portalPlaceholder = null;
                isPortalled = false;
            }
            if(previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
            previousFocus = null;
        }

        function attachUI(){
            if(cartButton) cartButton.addEventListener('click', (e)=>{
                e.stopPropagation();
                if(!cartPanel) return;
                const hidden = cartPanel.getAttribute('aria-hidden') === 'true';
                if(hidden) openCart(); else closeCart();
            });
            if(checkoutBtn) checkoutBtn.addEventListener('click', ()=> alert('Checkout is simulated — no payments configured.'));
            if(continueBtn) continueBtn.addEventListener('click', ()=> closeCart());
            // delegated remove handler: attach once to the list to avoid rebinding on each render
            if(cartItemsList){
                cartItemsList.addEventListener('click', (e)=>{
                    const btn = e.target.closest('.remove');
                    if(!btn || !cartItemsList.contains(btn)) return;
                    e.stopPropagation();
                    removeFromCart(btn.dataset.id);
                });
            }
        }

        // expose public API (include showCart to allow other modules to open the cart)
        return { attachUI, renderCart, addToCart, updateCartCount, showCart: openCart };
    })();

    /* -----------------------------
       Navigation / Mobile Nav Module
    ------------------------------*/
    /**
     * navModule
     * - handles opening/closing the mobile navigation and focus trapping
     */
    const navModule = (function () {
        const menuButton = $('#menuButton');
        const mobileNav = $('#mobileNav');
        let mobileKeydownHandler = null;

        function trapFocusIn(container, e){
            const focusable = getFocusableElements(container);
            if(!focusable.length) return;
            const first = focusable[0]; const last = focusable[focusable.length - 1];
            if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
            else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
        }

        function openMobileNav(){
            if(!mobileNav || !menuButton) return;
            menuButton.setAttribute('aria-expanded','true');
            mobileNav.setAttribute('aria-hidden','false');
            menuButton.classList.add('open');
            document.body.style.overflow = 'hidden';
            setTimeout(()=>{ const first = mobileNav.querySelector('.mobile-link'); if(first) first.focus(); }, 120);
            mobileKeydownHandler = function(e){ if(e.key === 'Escape') closeMobileNav(); else if(e.key === 'Tab') trapFocusIn(mobileNav, e); };
            document.addEventListener('keydown', mobileKeydownHandler);
        }

        function closeMobileNav(){
            if(!mobileNav || !menuButton) return;
            menuButton.setAttribute('aria-expanded','false');
            mobileNav.setAttribute('aria-hidden','true');
            menuButton.classList.remove('open');
            document.body.style.overflow = '';
            if(mobileKeydownHandler) document.removeEventListener('keydown', mobileKeydownHandler);
            mobileKeydownHandler = null;
            menuButton.focus();
        }

        function attachUI() {
            if (menuButton) {
                menuButton.addEventListener('click', () => {
                    const expanded = menuButton.getAttribute('aria-expanded') === 'true';
                    if (expanded) closeMobileNav(); else openMobileNav();
                });
            }

            $all('.mobile-link').forEach(l => l.addEventListener('click', () => closeMobileNav()));

            if (mobileNav) {
                mobileNav.addEventListener('click', (e) => { if (e.target === mobileNav) closeMobileNav(); });
            }
        }

        return { attachUI };
    })();

    /* -----------------------------
       Product interactions (variants & swatches)
    ------------------------------*/
    const productModule = (function(){
        let currentVariant = 'standard';
        let currentColor = (currentProduct && currentProduct.variants && currentProduct.variants[0])
            ? slugify(currentProduct.variants[0].name)
            : 'matte-black';

        function bindControls(){
            // variants (pricing variants like standard / pro)
            $all('.variant').forEach(btn => {
                btn.onclick = () => {
                    $all('.variant').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed','false'); });
                    btn.classList.add('active'); btn.setAttribute('aria-pressed','true');
                    currentVariant = btn.dataset.variant;
                    updatePrice();
                    // sync sticky bar price (if present)
                    try{ if(window.stickyModule && typeof window.stickyModule.update === 'function') window.stickyModule.update(currentProduct); }catch(e){}
                };
            });

            // swatches (color variants) — use onclick to ensure a single handler is active
            $all('.color-swatch').forEach(s => {
                s.onclick = () => {
                    $all('.color-swatch').forEach(x => x.classList.remove('selected'));
                    s.classList.add('selected');
                    currentColor = s.dataset.color;
                    imageModule.setProductImage(currentColor);

                    // update accessible label to reflect chosen color
                    try {
                        const pic = $('#productImage');
                        if (pic) {
                            const label = (s.title || s.getAttribute('title') || currentColor || '').toString();
                            pic.setAttribute('aria-label', `${currentProduct.title} in ${label}`);
                        }
                    } catch (e) {}
                };
            });
        }

        function init(){
            // Resolve the CTA button at init time to support the new hero shell (`#ctaButton`) or legacy `#addToCart`.
            const addBtnEl = $('#ctaButton') || $('#addToCart') || document.querySelector('.cta-button');
            // If the DOM changed since module creation, prefer the new element for local operations.
            // We'll use a local variable inside init for button feedback.
            const addBtnLocal = addBtnEl;
            const addBtnTextLocal = addBtnLocal ? addBtnLocal.textContent : 'Add to cart';
            // initial render
            updatePrice();
            cartModule.updateCartCount();
            imageModule.setProductImage(currentColor);
            // ensure the product image has an accurate accessible label for the initial color
            try{
                const pic = $('#productImage');
                if(pic){
                    const label = (currentColor || '').toString();
                    pic.setAttribute('aria-label', `${currentProduct.title} in ${label}`);
                }
            }catch(e){}

            // bind controls for the initial DOM
            bindControls();

            // add-to-cart (wire the resolved local button)
            if(addBtnLocal){ addBtnLocal.addEventListener('click', ()=>{
                const unitPrice = getVariantPrice(currentProduct);
                const displayName = currentProduct ? currentProduct.title : (currentVariant === 'pro' ? 'Aura Pro' : 'Aura Standard');
                const item = {
                    id: `${currentProductKey}-${currentVariant}-${currentColor}`,
                    product: currentProductKey,
                    variant: currentVariant,
                    color: currentColor,
                    name: displayName,
                    unitPrice,
                    qty: 1
                };
                // add item to cart (snapshot unitPrice + name)
                cartModule.addToCart(item);
                // update cart UI but do not open the cart to avoid dimming the page
                if(typeof cartModule.renderCart === 'function') cartModule.renderCart();

                // keep the small button feedback as well
                addBtnLocal.textContent = 'Added ✓';
                // Restore to the original label (fallback to 'Add to Cart' if original text is empty)
                setTimeout(()=>{ addBtnLocal.textContent = (addBtnTextLocal || 'Add to Cart'); }, 1200);
            }); }
        }

        function getVariantPrice(product){
            const fallback = (product && product.price) ? product.price : CONFIG.prices.standard;
            if(!product) return fallback;
            if(product.prices && product.prices[currentVariant] != null) return product.prices[currentVariant];
            if(CONFIG.prices && CONFIG.prices[currentVariant] != null) return CONFIG.prices[currentVariant];
            return fallback;
        }

        function getVariant(){ return currentVariant; }

        function setVariant(v){ currentVariant = v || 'standard'; updatePrice(); try{ if(window.stickyModule && typeof window.stickyModule.update === 'function') window.stickyModule.update(currentProduct); }catch(e){} }

        function updatePrice(){
            // Use the currently loaded product's price. Fall back to CONFIG.prices for legacy behavior.
            const p = getVariantPrice(currentProduct);
            const priceEl = document.querySelector('.price');
            if(priceEl){
                const newPrice = formatPrice(p);
                const old = priceEl.textContent || '';
                if(old !== newPrice){
                    priceEl.classList.remove('price-animate');
                    priceEl.textContent = newPrice;
                    void priceEl.offsetWidth;
                    priceEl.classList.add('price-animate');
                    setTimeout(()=>{ if(priceEl) priceEl.classList.remove('price-animate'); }, 420);
                } else {
                    priceEl.textContent = newPrice;
                }
            }

            const upgradeNote = $('#upgradeNote');
            if(upgradeNote){
                const isStandard = currentVariant === 'standard';
                upgradeNote.setAttribute('aria-hidden', String(!isStandard));
                upgradeNote.style.display = isStandard ? 'block' : 'none';
            }
        }

        return { init, bindControls, getVariantPrice, getVariant, setVariant };
    })();

    /* -----------------------------
       Product loader: swap between products in the `products` catalog
    ------------------------------*/
    function renderSwatches(product){
        const container = document.getElementById('colorOptions') || document.querySelector('.color-swatch-row');
        if(!container) return;
        container.innerHTML = '';
        // Build a mapping of slug -> image for this product so the imageModule can use it
        const productImageMap = {};
        product.variants.forEach((variant, index) => {
            const button = document.createElement('button');
            button.className = 'color-swatch';
            button.style.background = variant.color;
            button.title = variant.name || '';
            const slug = slugify(variant.name);
            button.dataset.color = slug;
            productImageMap[slug] = variant.image;

            button.addEventListener('click', () => {
                // Install the image map for this product and ask imageModule to switch to the selected color
                imageModule.setImageMap(productImageMap);
                imageModule.setProductImage(slug);
                // toggle selected class
                container.querySelectorAll('.color-swatch').forEach(b => b.classList.remove('selected'));
                button.classList.add('selected');
            });

            if(index === 0) button.classList.add('selected');
            container.appendChild(button);
        });

        // Ensure imageModule knows about the product's images (first mapping wins)
        imageModule.setImageMap(productImageMap);
    }


    /* -----------------------------
       Feature breakdown rendering
       Renders a headline and three feature cards based on product.features
    ------------------------------*/
    function renderFeatures(product) {
        const grid = document.getElementById('featuresGrid');
        const heading = document.querySelector('.features-heading');
        const visual = document.getElementById('featuresVisual');
        if (!grid || !heading) return;

        grid.innerHTML = '';
        if(visual) { visual.innerHTML = ''; visual.setAttribute('aria-hidden','true'); }

        // Dynamic heading based on product
        heading.textContent =
            product.title && product.title.includes('Desk')
                ? 'Designed for focused productivity'
                : 'Lighting that transforms your space';

        const features = Array.isArray(product.features) ? product.features : [];
        features.forEach(feature => {
            const item = document.createElement('div');
            item.className = 'feature-card';
            item.innerHTML = `
      <h4 class="feature-title">${feature.title}</h4>
      <p class="feature-description">${feature.description}</p>
    `;
            grid.appendChild(item);
        });

        // Optional supporting visual (product may include `visual` as an image URL or HTML string)
        try{
            if(visual && product.visual){
                visual.setAttribute('aria-hidden','false');
                // if the visual looks like a URL, render an <img>, otherwise inject HTML
                const url = String(product.visual || '');
                if(/^https?:\/\//i.test(url) || /\.(png|jpe?g|webp|svg)$/i.test(url)){
                    const img = document.createElement('img');
                    img.src = url;
                    img.alt = product.title + ' visual';
                    img.className = 'features-visual__img';
                    visual.appendChild(img);
                } else {
                    visual.innerHTML = url;
                }
            }
        }catch(e){}
    }

    function loadProduct(key){
        const product = products[key];
        if(!product) return;
        currentProductKey = key;
        currentProduct = product;

        const image = document.getElementById('productImage');
        const copy = document.querySelector('.hero-copy');

        // start fade out
        if(image){ image.classList.remove('fade-in'); image.classList.add('fade-out'); }
        if(copy) copy.classList.add('fade-out');

        // after brief delay swap content then fade in
        setTimeout(()=>{
            const titleEl = document.querySelector('.product-title');
            const subtitleEl = document.querySelector('.product-subtitle');
            const supportEl = document.querySelector('.product-support');
            const taglineEl = document.querySelector('.product-tagline');
            const priceEl = document.querySelector('.price');
            const metaEl = document.querySelector('.meta');
            const cta = document.getElementById('ctaButton') || document.querySelector('#addToCart');

            if(titleEl) titleEl.textContent = product.title;
            if(subtitleEl) subtitleEl.textContent = product.subtitle;
            if(supportEl) supportEl.textContent = product.support || '';
            if(taglineEl) taglineEl.textContent = product.tagline || '';
            if(priceEl){
                const newPriceText = `$${product.price}.00`;
                const oldPriceText = priceEl.textContent || '';
                if(oldPriceText !== newPriceText){
                    priceEl.classList.remove('price-animate');
                    priceEl.textContent = newPriceText;
                    void priceEl.offsetWidth; // force reflow to restart animation
                    priceEl.classList.add('price-animate');
                    setTimeout(()=>{ if(priceEl) priceEl.classList.remove('price-animate'); }, 420);
                } else {
                    priceEl.textContent = newPriceText;
                }
            }
            if(metaEl) metaEl.textContent = product.meta || '';
            if(cta) cta.textContent = 'Add to Cart';

            if(image){
                image.style.aspectRatio = product.ratio || '1 / 1';
                // Prepare a local image map keyed by slug so the imageModule can use semantic keys
                const map = product.variants.reduce((m, v) => { m[slugify(v.name)] = v.image; return m; }, {});
                imageModule.setImageMap(map);
                // Show the first variant by slug using the imageModule (handles fade + resolution)
                const firstSlug = slugify(product.variants[0].name);
                imageModule.setProductImage(firstSlug);
            }

            renderSwatches(product);
            renderFeatures(product);

            // reset variant selector to default (standard) when switching products
            try{ if(productModule && typeof productModule.setVariant === 'function') productModule.setVariant('standard'); }catch(e){}
            try{ if(productModule && typeof productModule.bindControls === 'function') productModule.bindControls(); }catch(e){}

            // Update sticky ATC when the product changes (if stickyModule exists)
            try{ if(window.stickyModule && typeof window.stickyModule.update === 'function') window.stickyModule.update(product); }catch(e){}

            // fade back in
            if(image){
                image.classList.remove('fade-out');
                image.classList.add('fade-in');
                // remove the fade-in class after animation completes
                setTimeout(()=>{ if(image) image.classList.remove('fade-in'); }, 500);
            }
            if(copy) copy.classList.remove('fade-out');
        }, 250);
    }

    /* -----------------------------
       Initialization
    ------------------------------*/
    document.addEventListener('DOMContentLoaded', ()=>{
        // wire modules
        cartModule.attachUI();
        navModule.attachUI();
        // product switcher: wire tabs to call loadProduct and toggle active state
        const tabs = Array.from(document.querySelectorAll('.product-tab'));
        if(tabs.length){
            tabs.forEach(tab => {
                tab.addEventListener('click', () => {
                    tabs.forEach(t => { t.classList.remove('active'); t.setAttribute('aria-pressed','false'); });
                    tab.classList.add('active'); tab.setAttribute('aria-pressed','true');
                    const key = tab.dataset.product;
                    if(typeof loadProduct === 'function') loadProduct(key);
                });
            });
        }

        // load the initial product and initialize product controls
        if(typeof loadProduct === 'function') loadProduct('desk');
        productModule.init();

        /* Sticky ATC module
           - shows a minimal add-to-cart bar when the user scrolls past the hero
           - updates its content when loadProduct is called
        */
        window.stickyModule = (function(){
            const bar = document.getElementById('stickyAtc');
            const img = document.getElementById('stickyImage');
            const titleEl = document.querySelector('.sticky-atc__title');
            const priceEl = document.getElementById('stickyPrice');
            const addBtn = document.getElementById('stickyAddToCart');
            const trigger = document.querySelector('.product-hero');

            function update(product){
                if(!product) return;
                try{
                    const first = product.variants && product.variants[0];
                    const slug = first ? slugify(first.name) : '';
                    const url = imageModule.getImageUrl(slug) || (first && first.image) || '';
                    if(img && url) img.src = resolveAsset(url);
                }catch(e){}
                if(titleEl) titleEl.textContent = product.title || '';
                if(priceEl){
                    // prefer module-aware variant pricing when available
                    let variantPrice = null;
                    try{ if(typeof productModule !== 'undefined' && typeof productModule.getVariantPrice === 'function') variantPrice = productModule.getVariantPrice(product); }catch(e){}
                    const value = variantPrice != null ? variantPrice : (product.price || 0);
                    const newPrice = formatPrice(value);
                    const old = priceEl.textContent || '';
                    if(old !== newPrice){
                        priceEl.classList.remove('price-animate');
                        priceEl.textContent = newPrice;
                        void priceEl.offsetWidth;
                        priceEl.classList.add('price-animate');
                        setTimeout(()=>{ if(priceEl) priceEl.classList.remove('price-animate'); }, 420);
                    } else {
                        priceEl.textContent = newPrice;
                    }
                }
            }

            function checkScroll(){
                if(!trigger || !bar) return;
                const rect = trigger.getBoundingClientRect();
                // premium behavior: hide the sticky when the footer is near/visible
                const footer = document.querySelector('footer');
                let footerTop = Infinity;
                if(footer) {
                    try{ footerTop = footer.getBoundingClientRect().top; }catch(e){}
                }

                // show only after hero scrolls off-screen AND before footer comes into view
                const heroOff = rect.bottom < 0;
                const footerBelowViewport = footerTop > (window.innerHeight || document.documentElement.clientHeight);

                if(heroOff && footerBelowViewport){
                    bar.classList.add('visible');
                } else {
                    bar.classList.remove('visible');
                }
            }

            function bind(){
                if(addBtn){
                    addBtn.addEventListener('click', ()=>{
                        const primary = document.getElementById('ctaButton');
                        if(primary) primary.click();
                    });
                }
                window.addEventListener('scroll', checkScroll, { passive: true });
                setTimeout(checkScroll, 300);
            }

            function init(){ bind(); }

            init();
            return { update, init };
        })();
    });
})();
