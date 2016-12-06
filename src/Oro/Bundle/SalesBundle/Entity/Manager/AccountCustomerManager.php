<?php

namespace Oro\Bundle\SalesBundle\Entity\Manager;

use Doctrine\Common\Util\ClassUtils;

use Oro\Bundle\AccountBundle\Entity\Account;
use Oro\Bundle\AccountBundle\Entity\AccountAwareInterface;
use Oro\Bundle\EntityBundle\ORM\DoctrineHelper;

use Oro\Bundle\EntityBundle\Provider\EntityNameResolver;
use Oro\Bundle\EntityExtendBundle\Tools\ExtendHelper;
use Oro\Bundle\SalesBundle\Entity\Customer;
use Oro\Bundle\SalesBundle\Entity\Repository\CustomerRepository;
use Oro\Bundle\SalesBundle\EntityConfig\CustomerScope;
use Oro\Bundle\SalesBundle\Exception\Customer\InvalidCustomerRelationEntityException;
use Oro\Bundle\SalesBundle\Exception\Customer\NotAccessableCustomerTargetException;
use Oro\Bundle\SalesBundle\Provider\Customer\ConfigProvider;

class AccountCustomerManager
{
    /** @var DoctrineHelper */
    protected $doctrineHelper;

    /** @var ConfigProvider */
    protected $provider;

    /** @var EntityNameResolver */
    protected $nameResolver;

    /**
     * @param DoctrineHelper     $doctrineHelper
     * @param ConfigProvider     $provider
     * @param EntityNameResolver $nameResolver
     */
    public function __construct(
        DoctrineHelper $doctrineHelper,
        ConfigProvider $provider,
        EntityNameResolver $nameResolver
    ) {
        $this->doctrineHelper = $doctrineHelper;
        $this->provider       = $provider;
        $this->nameResolver   = $nameResolver;
    }

    /**
     * Returns Customer's associated target if it set or Account otherwise
     *
     * @param Customer $customer
     *
     * @return object|Account
     */
    public static function getTargetCustomerOrAccount(Customer $customer)
    {
        return $customer->getCustomerTarget() ? : $customer->getAccount();
    }

    /**
     * @param $targetClassName
     *
     * @return string
     */
    public static function getCustomerTargetField($targetClassName)
    {
        return ExtendHelper::buildAssociationName(
            $targetClassName,
            CustomerScope::ASSOCIATION_KIND
        );
    }

    /**
     * Creates new Customer from provided Account
     *
     * @param Account $account
     *
     * @return Customer
     */
    public static function createCustomerFromAccount(Account $account)
    {
        $customer = new Customer();

        return $customer->setAccount($account);
    }

    /**
     * @param object $target
     *
     * @return Customer|null
     */
    public function getOrCreateAccountCustomerByTarget($target)
    {
        $customerRepo = $this->getCustomerRepository();
        if ($target instanceof Account) {
            $customerFields = $this->getCustomerTargetFields();
            $customer       = $customerRepo->getCustomerWithoutAssociatedTargets($target, $customerFields);
            if (!$customer) {
                $customer = self::createCustomerFromAccount($target);
            }
        } else {
            $targetClassName = ClassUtils::getClass($target);
            $this->assertValidTarget($targetClassName);
            $targetField = self::getCustomerTargetField($targetClassName);
            $customer    = $customerRepo
                ->findOneBy(
                    [$targetField => $this->doctrineHelper->getSingleEntityIdentifier($target)]
                );

            if (!$customer) {
                return $this->doCreateCustomerFromTarget($target);
            }
        }

        return $customer;
    }

    /**
     * Syncs target entity's Account with related Customer entity
     *
     * @param Customer $customer
     */
    public function syncTargetCustomerAccount(Customer $customer)
    {
        $target = $customer->getCustomerTarget();
        if (!$target) {
            throw new NotAccessableCustomerTargetException(
                'Couldn\'t sync Customer\'s target account without target'
            );
        }

        $account = $this->createOrGetAccountFromTarget($target);
        $customer->setAccount($account);
    }

    /**
     * @return array
     */
    protected function getCustomerTargetFields()
    {
        $customerFields = [];
        foreach ($this->provider->getCustomerClasses() as $customerClass) {
            $customerField    = ExtendHelper::buildAssociationName(
                $customerClass,
                CustomerScope::ASSOCIATION_KIND
            );
            $customerFields[] = $customerField;
        }

        return $customerFields;
    }

    /**
     * @param string $targetClassName
     */
    protected function assertValidTarget($targetClassName)
    {
        if (!in_array($targetClassName, $this->provider->getCustomerClasses())) {
            throw new InvalidCustomerRelationEntityException(
                sprintf('object of class "%s" is not valid customer target', $targetClassName)
            );
        }
    }

    /**
     * @param object $target
     *
     * @return Customer
     */
    protected function doCreateCustomerFromTarget($target)
    {
        $account  = $this->createOrGetAccountFromTarget($target);
        $customer = self::createCustomerFromAccount($account);

        return $customer->setCustomerTarget($target);
    }

    /**
     * @return CustomerRepository
     */
    protected function getCustomerRepository()
    {
        return $this->doctrineHelper->getEntityRepository(Customer::class);
    }

    /**
     * @param $target
     *
     * @return Account
     */
    protected function createOrGetAccountFromTarget($target)
    {
        if (!($target instanceof AccountAwareInterface) || !$target->getAccount()) {
            $account = (new Account())->setName($this->nameResolver->getName($target));
        } else {
            $account = $target->getAccount();
        }

        return $account;
    }
}
