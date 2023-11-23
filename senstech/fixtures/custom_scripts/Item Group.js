frappe.ui.form.on('Item Group', {
	validate(frm) {
		if (frm.doc.has_batch_no && !frm.doc.is_stock_item) {
	        validation_error(frm, 'has_batch_no', __("Nur Artikel mit Lagerhaltung können Chargennummern haben"));
	    }
	    if (frm.doc.benoetigt_chargenfreigabe && !frm.doc.has_batch_no) {
	        validation_error(frm, 'benoetigt_chargenfreigabe', __("Die Chargenfreigabe setzt die Vergabe von Chargennummern voraus"));
	    }
	},
	refresh(frm) {
		
	}
})