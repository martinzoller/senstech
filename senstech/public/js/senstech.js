// Always open linked documents (links with arrow icon) in new tab
jQuery(document).on('click','i.octicon-arrow-right',function(event){
	event.preventDefault();
	event.stopPropagation();
	window.open($(this).parent().attr('href'), '_blank');
});

// Uncheck "attach document print" in e-mail window for some doctypes
jQuery(document).ready(function() {
	const observer = new MutationObserver( () => {
		var doctype = frappe._cur_route.split('/')[1];
		if(['Lead','Opportunity','Customer','Supplier','Contact','Address'].includes(doctype)) {
			jQuery('input[data-fieldname="attach_document_print"]').each(function() {
				if($(this).prop('checked')) {
					$(this).click();
				}
			});
		}
	});

	observer.observe(document.body, { childList: true });
});

// add links to senstech wiki
frappe.provide('frappe.help.help_links');

frappe.call({
	method: 'senstech.utils.get_help_links',
	callback: function(r) {
		if(r.message) {
			var links = r.message;
			for (var i = 0; i < links.length; i++) {
				frappe.help.help_links['List/' + links[i].doctype_link] = [
					{ label: 'Senstech Wiki', url: links[i].url },
				];
				frappe.help.help_links['Form/' + links[i].doctype_link] = [
					{ label: 'Senstech Wiki', url: links[i].url },
				];
				frappe.help.help_links['Tree/' + links[i].doctype_link] = [
					{ label: 'Senstech Wiki', url: links[i].url },
				];
			}
		} 
	}
});
