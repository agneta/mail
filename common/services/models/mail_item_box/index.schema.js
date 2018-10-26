module.exports = {
  name: 'Mail_Item_Box',
  base: 'PersistedModel',
  properties: {
    itemId: {
      type: 'objectid',
      required: true
    },
    mailboxId: {
      type: 'objectid',
      required: true
    }
  },
  validations: [],
  relations: {
    item: {
      type: 'belongsTo',
      model: 'Mail_Item',
      foreignKey: 'itemId'
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
        itemId: 1
      },
      options: {
        unique: true
      }
    }
  }
};
