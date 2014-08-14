define([
    'underscore',
    'orotranslation/js/translator',
    'backbone', 'oroui/js/mediator',
    'oroui/js/delete-confirmation',
    '../../utils/channel-form-utils',
    '../../entity-management/entity-component-view',
    'jquery.select2'
], function (_, __, Backbone, mediator, DeleteConfirmation, utils, EntityComponentView) {
    'use strict';

    var $ = Backbone.$;

    /**
     * @todo probably should not be an instance of backbone view
     * @class   orocrmchannel.app.components.Channel
     * @extends Backbone.View
     */
    var ChannelFormComponentView = Backbone.View.extend({

        /**
         * @const
         */
        UPDATE_MARKER: 'formUpdateMarker',

        /**
         * @type {jQuery}
         */
        $channelTypeEl: null,

        /**
         * @type {jQuery}
         */
        $channelEntitiesEl: null,

        /**
         * @type {jQuery}
         */
        $customerIdentityEl: null,

        /**
         * @type array
         */
        selectedEntities: [],

        /**
         * Keeps predefined customer identity value
         *
         * @type Object
         */
        predefinedCustomerIdentity: {
            id: null,
            name: null,
            locked: false
        },

        /**
         * Array of fields that should be submitted for form update
         * Depends on what exact field changed
         */
        fields: {
            name: null,
            channelType: null
        },

        /**
         * Initialize.
         *
         * @param {Object} options
         */
        initialize: function (options) {
            this.options = _.defaults(options || {}, this.options);

            if (!(options.formSelector &&
                    options.channelTypeEl &&
                    options.channelEntitiesEl &&
                    options.customerIdentityEl)
                ) {
                throw new TypeError('Missing required options for ChannelView');
            }

            this.fields = _.extend(this.fields, options.fields);
            this.$channelTypeEl = $(options.channelTypeEl);
            this.$channelEntitiesEl = $(options.channelEntitiesEl);
            this.$customerIdentityEl = $(options.customerIdentityEl);

            this.$channelTypeEl.on('change', _.bind(this.changeTypeHandler, this));
            this.$channelEntitiesEl.on('change', _.bind(this.changeEntitiesHandler, this));

            this._initCustomerIdentityField(this.$customerIdentityEl);
            this.changeEntitiesHandler();
            this._setCustomerIdentityValue(this.$customerIdentityEl.val());
        },

        /**
         * Open modal window
         *
         * @param e
         */
        changeTypeHandler: function (e) {
            var prevEl = e.removed,
                confirm = new DeleteConfirmation({
                    title:    __('orocrm.channel.confirmation.title'),
                    okText:   __('orocrm.channel.confirmation.agree'),
                    content:  __('orocrm.channel.confirmation.text')
                });

            confirm.on('ok', _.bind(function () {
                this._processChangeType();
            }, this));

            confirm.on('cancel', _.bind(function () {
                this.$channelTypeEl.select2('val', prevEl.id)
            }, this));

            confirm.open();
        },

        /**
         * Reload form on change form type
         */
        _processChangeType: function () {
            var $form = $(this.options.formSelector),
                data = $form.serializeArray(),
                url = $form.attr('action'),
                elementNames = _.map(this.options.fields, function (elementIdentifier) {
                    return $(elementIdentifier).attr('name');
                });

            data = _.filter(data, function (field) {
                return _.indexOf(elementNames, field.name) !== -1;
            });
            data.push({name: this.UPDATE_MARKER, value: 1});

            var event = { formEl: $form, data: data, reloadManually: true };
            mediator.trigger('channelViewFormReload:before', event);

            if (event.reloadManually) {
                mediator.execute('submitPage', {url: url, type: $form.attr('method'), data: $.param(data)});
            }
        },

        /**
         * This is listening changes in `Entities` field and fill `Customer identity` field
         */
        changeEntitiesHandler: function () {
            var selectedEntities = this.$channelEntitiesEl.find('option:selected');

            this.selectedEntities = _.map(selectedEntities, function (optionEl) {
                var $option = $(optionEl);

                return {
                    id:   $option.val(),
                    text: $option.text()
                };
            });

            this._ensureCustomerIdentityInSync();
        },

        /**
         * Validate `select2` if you delete value from `Entities` field and don't delete from `Customer identity`
         * field, it will reset value in `Customer identity` field
         *
         * @private
         */
        _ensureCustomerIdentityInSync: function () {
            var value = this.$customerIdentityEl.val();

            if (value) {
                if (!_.findWhere(this.selectedEntities, {id: value})) {
                    this._setCustomerIdentityValue('');
                }
            }
        },

        /**
         * Build `select2`
         *
         * @param {string|jQuery} selector "Customer identity" field selector
         *
         * @private
         */
        _initCustomerIdentityField: function (selector) {
            var self = this;

            this._checkOnReadOnly(selector, self);

            $(selector).select2({
                placeholder: __('orocrm.channel.form.select_customer_identity'),
                data: function () {
                    return utils.prepareSelect2Data(self.selectedEntities)
                }
            });
        },


        /**
         * Check whether the item is read-only to select predefined value, if it exists
         *
         * @param selector
         * @param self
         *
         * @private
         */
        _checkOnReadOnly: function (selector, self) {
            if ("readonly" === $(selector).attr('readonly')) {
                var customerIdentityFQCN = $(selector).val();
                var entityOptions = this.$channelEntitiesEl.find('option');

                _.each(entityOptions, function (value) {
                    if ($(value).val() === customerIdentityFQCN) {
                        $(value).attr("selected", "selected").attr("locked", "locked");

                        self.predefinedCustomerIdentity.id = $(value).val();
                        self.predefinedCustomerIdentity.text = $(value).text();
                        self.predefinedCustomerIdentity.locked = true;

                        self.selectedEntities.push(self.predefinedCustomerIdentity);
                    }
                });

                self.selectedEntities.push(self.predefinedCustomerIdentity.name);

                this.$channelEntitiesEl.select2();
            }
        },

        /**
         * Set `Customer Identity` field value
         *
         * @param value
         */
        _setCustomerIdentityValue: function (value) {
            this.$customerIdentityEl.select2('val', value);
        }
    });

    function initializeEntityComponent(entitiesEl, metadata) {
        var $entitiesEl = $(entitiesEl),
            value = $entitiesEl.val(),
            entities = value ? JSON.parse(value) : [],
            entityComponentView = new EntityComponentView({
                data:       entities,
                mode:       EntityComponentView.prototype.MODES.EDIT_MODE,
                metadata:   metadata
            });
        entityComponentView.render();

        $entitiesEl.after(entityComponentView.$el);
    }

    /**
     * Initialize channel form component
     *
     * @param {Object} options
     */
    return function (options) {
        var view = new ChannelFormComponentView(options);
        initializeEntityComponent(options.channelEntitiesEl, options.entitiesMetadata);
        options._sourceElement.remove();

        return view;
    }
});
