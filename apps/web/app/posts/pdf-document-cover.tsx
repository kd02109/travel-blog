import styles from "./pdf-document-cover.module.css";

/** A list-card cover; the article reader still displays the real PDF. */
export function PdfDocumentCover({ title }: { title: string }) {
  return (
    <div className={styles.field} aria-hidden="true">
      <span className={styles.fieldLabel} aria-hidden="true">
        DOCUMENT COVER
      </span>
      <div className={styles.sheet} aria-hidden="true">
        <div className={styles.sheetHead}>
          <span>
            TRAVEL JOURNAL
            <br />
            ITINERARY
          </span>
          <span>NOTE</span>
        </div>
        <div className={styles.rule} />
        <strong className={styles.title}>{title}</strong>
        <span className={styles.subtitle}>여행의 순서를 기록하다</span>
        <div className={styles.route}>
          <svg viewBox="0 0 180 70" preserveAspectRatio="none" aria-hidden="true">
            <path d="M14 54 C38 52, 44 21, 77 31 S126 49, 166 13" />
            <circle cx="14" cy="54" r="4" />
            <circle cx="77" cy="31" r="4" />
            <circle cx="166" cy="13" r="4" />
          </svg>
        </div>
        <div className={styles.rows}>
          <i />
          <i />
          <i />
        </div>
        <span className={styles.sheetFoot}>오늘도 함께 걷다</span>
      </div>
      <span className={styles.pdfMark} aria-hidden="true">
        <svg viewBox="0 0 20 20" fill="none">
          <path d="M5 2.5h6l4 4v11H5z" />
          <path d="M11 2.5v4h4" />
        </svg>
        PDF
      </span>
    </div>
  );
}
