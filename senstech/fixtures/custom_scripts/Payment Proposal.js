frappe.ui.form.on('Payment Proposal', {
	refresh(frm) {
		if(!frm.doc.title) {
		    frm.set_value('title',frm.doc.date);
		}
	},
	date(frm) {
		if(!frm.doc.title || frm.doc.title.match(/^\d{4}-\d{2}-\d{2}$/)) {
		    frm.set_value('title',frm.doc.date);
		}
	}
});