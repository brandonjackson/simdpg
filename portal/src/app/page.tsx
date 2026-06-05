import { CATEGORIES, getServicesByCategory } from "@/lib/service-registry";

export default function Home() {
  const categoriesWithServices = CATEGORIES.map((category) => ({
    ...category,
    services: getServicesByCategory(category.id).filter(
      (s) => s.showOnHomepage
    ),
  })).filter((cat) => cat.services.length > 0);

  return (
    <>
      <h1 className="govuk-heading-xl">Government services</h1>
      <p className="govuk-body-l">
        Use this portal to access SimDPG government services, including civil
        registration, health, and benefits.
      </p>

      {categoriesWithServices.map((category, index) => (
        <div key={category.id}>
          {index > 0 && (
            <hr className="govuk-section-break govuk-section-break--l govuk-section-break--visible" />
          )}
          <h2 className="govuk-heading-m">{category.name}</h2>
          <ul className="govuk-service-list">
            {category.services.map((service) => (
              <li key={service.id} className="govuk-service-list__item">
                <a href={service.href} className="govuk-service-list__link govuk-link">
                  {service.name}
                </a>
                <p className="govuk-service-list__description">
                  {service.description}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <hr className="govuk-section-break govuk-section-break--l govuk-section-break--visible" />

      <p className="govuk-body-s">
        <a href="/staff" className="govuk-link">
          Staff area
        </a>{" "}
        &mdash; for authorised government staff only.
      </p>
    </>
  );
}
