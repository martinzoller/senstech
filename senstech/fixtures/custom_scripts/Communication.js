frappe.ui.form.on('Communication', {
	refresh(frm) {
        frm.add_custom_button('Unlink E-Mail Queue', function() {
			unlink_email_queue(frm);
	    });
    }
})

function unlink_email_queue(frm) {
    frappe.call({
        "method": "senstech.scripts.communication_tools.unlink_email_queue",
        "args": {
            "communication": frm.doc.name
        }
    });
    frappe.msgprint(__("Unlinked"));
}