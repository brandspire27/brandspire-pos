import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="shell">
      <header className="navbar">
        <div className="brand-lockup">
          <span className="brand-mark">BP</span>
          <div className="brand-copy"><strong>Brandspire POS</strong><small>A Brandspire Product</small></div>
        </div>
        <div className="nav-actions">
          <Link className="btn" href="/auth/login">Login</Link>
          <Link className="btn btn-primary" href="/auth/signup">Get Started</Link>
        </div>
      </header>

      <section className="hero">
        <div>
          <span className="eyebrow">Fast billing for everyday Indian business</span>
          <h1>Bill faster.<br />Run simpler.</h1>
          <p className="hero-copy">
            Brandspire POS keeps billing, products, customers, stock and receipts in one focused workspace—easy for Owners, even easier for Staff.
          </p>
          <div className="hero-actions">
            <Link className="btn btn-primary" href="/auth/signup">Start with Brandspire POS</Link>
            <Link className="btn" href="/auth/login">Login to your workspace</Link>
          </div>
          <div className="hero-proof">
            <span>GST-ready billing</span><span>58mm · 80mm · A4</span><span>English · हिंदी · Hinglish</span>
          </div>
        </div>

        <aside className="pos-preview" aria-label="Brandspire POS billing preview">
          <div className="preview-top">
            <div><strong>Counter</strong><small> · fast mode</small></div>
            <span className="preview-live">READY</span>
          </div>
          <div className="preview-body">
            <div className="preview-products">
              <span className="preview-label">PRODUCTS</span>
              <div className="preview-product"><span><strong>LED Bulb 12W</strong><small>18% GST · 18 pcs</small></span><strong>₹220</strong></div>
              <div className="preview-product"><span><strong>Extension Board</strong><small>18% GST · 9 pcs</small></span><strong>₹499</strong></div>
              <div className="preview-product"><span><strong>Type-C Cable</strong><small>18% GST · 26 pcs</small></span><strong>₹299</strong></div>
            </div>
            <div className="preview-bill">
              <span className="preview-label">CURRENT BILL</span>
              <div className="preview-line"><span><strong>LED Bulb 12W × 2</strong><small>Tax included</small></span><strong>₹440</strong></div>
              <div className="preview-line"><span><strong>Type-C Cable × 1</strong><small>Tax included</small></span><strong>₹299</strong></div>
              <div className="preview-total"><span>Payable</span><strong>₹739</strong></div>
              <div className="preview-pay">Generate Bill · Cash</div>
            </div>
          </div>
          <div className="preview-footer">
            <div className="preview-chip"><strong>Simple</strong><small>Less training</small></div>
            <div className="preview-chip"><strong>Fast</strong><small>Fewer clicks</small></div>
            <div className="preview-chip"><strong>Reliable</strong><small>Bill saves first</small></div>
          </div>
        </aside>
      </section>
    </main>
  );
}
