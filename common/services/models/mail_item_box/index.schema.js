module.exports = {
  name: 'Mail_Item_Box',
  base: 'PersistedModel',
  properties: {
    itemlId: {
      type: 'string',
      required: true
    },
    mailboxId: {
      type: 'string',
      required: true
    }
  },
  validations: [],
  relations: {
    item: {
      type: 'belongsTo',
      model: 'Mail_Item',
      foreignKey: 'itemlId'
    },
    mailbox: {
      type: 'belongsTo',
      model: 'Mail_Box',
      foreignKey: 'mailboxId'
    }
  },
  indexes: {
    unique: {
      keys: {
        mailboxId: 1,
        itemlId: 1
      },
      options: {
        unique: true
      }
    }
  }
};
