frappe.ui.form.on('Payment Proposal', {
	refresh(frm) {
		if(!cur_frm.doc.title) {
		    cur_frm.set_value('title',cur_frm.doc.date);
		}
	},
	date(frm) {
		if(!cur_frm.doc.title || cur_frm.doc.title.match(/^\d{4}-\d{2}-\d{2}$/)) {
		    cur_frm.set_value('title',cur_frm.doc.date);
		}
	}
});