frappe.ui.form.on('Payment Entry', {
	onload_post_render(frm) {
        // Feld "Nummernkreis" lässt sich nicht mit Customization verstecken
        jQuery('div[data-fieldname="naming_series"]').hide();
    },
    refresh(frm) {
        if (frm.doc.docstatus === 0) {
            frm.add_custom_button(__("Abklärungskonto"), function() {
                deduct_to_unclear(frm);
            });
            frm.add_custom_button(__("Kreditkarte"), function() {
                credit_card(frm);
            });
            frm.add_custom_button(__("Rundung"), function() {
                rounding(frm);
            });
            frm.add_custom_button(__("Spesen des Geldverkehrs"), function() {
                bank_expenses(frm);
            });
            frm.add_custom_button(__("Löhne"), function() {
                salaries(frm);
            });
            frm.add_custom_button(__("SVA"), function() {
                sva(frm);
            });
            frm.add_custom_button(__("Kurs"), function() {
                exchange(frm);
            });
            frm.add_custom_button(__("Miete"), function() {
                rent(frm);
            });
        }
    },
    unallocated_amount: function(frm) {         // mark unallocated field red if not = 0
        if ((frm.doc.unallocated_amount) && (frm.doc.unallocated_amount !== 0)) {
            $('div[data-fieldname="unallocated_amount"]').css("background-color", "rgba(255, 99, 71, 0.5)");
        } else {
            $('div[data-fieldname="unallocated_amount"]').css("background-color", "white");
        }
    }
});

function deduct_to_unclear(frm) {
    add_deduction("1097 - Durchlaufkonto Zahlungskonten - ST", "Haupt - ST", frm.doc.unallocated_amount || frm.doc.difference_amount);
}

function credit_card(frm) {
    add_deduction("1095 - Firmenkreditkarte - ST", "Haupt - ST", frm.doc.unallocated_amount || frm.doc.difference_amount);
}

function rounding(frm) {
    add_deduction("6940 - Bank-/PC-Spesen - ST", "Haupt - ST", frm.doc.unallocated_amount || frm.doc.difference_amount);
}

function bank_expenses(frm) {
    add_deduction("6940 - Bank-/PC-Spesen - ST", "Haupt - ST", frm.doc.unallocated_amount || frm.doc.difference_amount);
}

function salaries(frm) {
    add_deduction("1091 - Lohndurchlaufkonto - ST", "Haupt - ST", frm.doc.unallocated_amount || frm.doc.difference_amount);
}

function sva(frm) {
    add_deduction("5700 - AHV / IV / EO - ST", "Haupt - ST", frm.doc.unallocated_amount || frm.doc.difference_amount);
}

function exchange(frm) {
    var amount = frm.doc.unallocated_amount || frm.doc.difference_amount;
    if (amount > 0) {
        add_deduction("6974 - realisierte Kursverluste - ST", "Haupt - ST", frm.doc.unallocated_amount || frm.doc.difference_amount);
    } else {
        add_deduction("6975 - realisierte Kursgewinne - ST", "Haupt - ST", frm.doc.unallocated_amount || frm.doc.difference_amount);
    }
}

function rent(frm) {
    add_deduction("6000 - Miete - ST", "Haupt - ST", frm.doc.unallocated_amount || frm.doc.difference_amount);
}

function add_deduction(account, cost_center, amount) {
    var child = cur_frm.add_child('deductions');
    frappe.model.set_value(child.doctype, child.name, 'account', account);
    frappe.model.set_value(child.doctype, child.name, 'cost_center', cost_center);
    frappe.model.set_value(child.doctype, child.name, 'amount', amount);
    cur_frm.refresh_field('deductions');
}
