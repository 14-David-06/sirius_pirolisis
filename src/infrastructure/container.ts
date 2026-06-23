// src/infrastructure/container.ts
// Container de inyección de dependencias para la aplicación

import { IUserRepository } from '../domain/repositories/IUserRepository';
import { IeBiomasRepository } from '../domain/repositories/IEBiomasRepository';
import { IEPirolisisRepository } from '../domain/repositories/IEPirolisisRepository';
import { IETransporteRepository } from '../domain/repositories/IETransporteRepository';
import { IEUseRepository } from '../domain/repositories/IEUseRepository';
import { IAforoRepository } from '../domain/repositories/IAforoRepository';
import { AuthService } from '../application/services/AuthService';
import { CalculareBiomasUseCase } from '../application/services/CalcularEBiomasUseCase';
import { GetResultadoseBiomasUseCase } from '../application/services/GetResultadosEBiomasUseCase';
import { PrevieweBiomasUseCase } from '../application/services/PreviewEBiomasUseCase';
import { CalcularEPirolisisUseCase } from '../application/services/CalcularEPirolisisUseCase';
import { GetResultadosEPirolisisUseCase } from '../application/services/GetResultadosEPirolisisUseCase';
import { PreviewEPirolisisUseCase } from '../application/services/PreviewEPirolisisUseCase';
import { CalcularETransporteUseCase } from '../application/services/CalcularETransporteUseCase';
import { GetResultadosETransporteUseCase } from '../application/services/GetResultadosETransporteUseCase';
import { PreviewETransporteUseCase } from '../application/services/PreviewETransporteUseCase';
import { CalcularEUseUseCase } from '../application/services/CalcularEUseUseCase';
import { GetResultadosEUseUseCase } from '../application/services/GetResultadosEUseUseCase';
import { PreviewEUseUseCase } from '../application/services/PreviewEUseUseCase';
import { CreateAforoUseCase } from '../application/services/CreateAforoUseCase';
import { GetAforosByTurnoUseCase } from '../application/services/GetAforosByTurnoUseCase';
import { DeleteAforoUseCase } from '../application/services/DeleteAforoUseCase';
import { InferirTipoAperturaUseCase } from '../application/services/InferirTipoAperturaUseCase';
import { AirtableUserRepository } from './repositories/AirtableUserRepository';
import { PostgresUserRepository } from './repositories/PostgresUserRepository';
import { eBiomasAirtableRepository } from './repositories/EBiomasAirtableRepository';
import { EPirolisisAirtableRepository } from './repositories/EPirolisisAirtableRepository';
import { ETransporteAirtableRepository } from './repositories/ETransporteAirtableRepository';
import { EUseAirtableRepository } from './repositories/EUseAirtableRepository';
import { AforoAirtableRepository } from './repositories/AforoAirtableRepository';

// Feature flag para elegir implementación
const USE_POSTGRES = process.env.USE_POSTGRES_REPOSITORY === 'true';

export class Container {
  private static userRepository: IUserRepository | null = null;
  private static authService: AuthService | null = null;
  private static eBiomasRepository: IeBiomasRepository | null = null;
  private static calculareBiomasUseCase: CalculareBiomasUseCase | null = null;
  private static getResultadoseBiomasUseCase: GetResultadoseBiomasUseCase | null = null;
  private static previeweBiomasUseCase: PrevieweBiomasUseCase | null = null;
  private static ePirolisisRepository: IEPirolisisRepository | null = null;
  private static calcularEPirolisisUseCase: CalcularEPirolisisUseCase | null = null;
  private static getResultadosEPirolisisUseCase: GetResultadosEPirolisisUseCase | null = null;
  private static previewEPirolisisUseCase: PreviewEPirolisisUseCase | null = null;
  private static eTransporteRepository: IETransporteRepository | null = null;
  private static calcularETransporteUseCase: CalcularETransporteUseCase | null = null;
  private static getResultadosETransporteUseCase: GetResultadosETransporteUseCase | null = null;
  private static previewETransporteUseCase: PreviewETransporteUseCase | null = null;
  private static eUseRepository: IEUseRepository | null = null;
  private static calcularEUseUseCase: CalcularEUseUseCase | null = null;
  private static getResultadosEUseUseCase: GetResultadosEUseUseCase | null = null;
  private static previewEUseUseCase: PreviewEUseUseCase | null = null;
  private static aforoRepository: IAforoRepository | null = null;
  private static createAforoUseCase: CreateAforoUseCase | null = null;
  private static getAforosByTurnoUseCase: GetAforosByTurnoUseCase | null = null;
  private static deleteAforoUseCase: DeleteAforoUseCase | null = null;
  private static inferirTipoAperturaUseCase: InferirTipoAperturaUseCase | null = null;

  static getUserRepository(): IUserRepository {
    if (!this.userRepository) {
      this.userRepository = USE_POSTGRES
        ? new PostgresUserRepository()
        : new AirtableUserRepository();
    }
    return this.userRepository;
  }

  static getAuthService(): AuthService {
    if (!this.authService) {
      this.authService = new AuthService(this.getUserRepository());
    }
    return this.authService;
  }

  static geteBiomasRepository(): IeBiomasRepository {
    if (!this.eBiomasRepository) {
      this.eBiomasRepository = new eBiomasAirtableRepository();
    }
    return this.eBiomasRepository;
  }

  static getCalculareBiomasUseCase(): CalculareBiomasUseCase {
    if (!this.calculareBiomasUseCase) {
      this.calculareBiomasUseCase = new CalculareBiomasUseCase(this.geteBiomasRepository());
    }
    return this.calculareBiomasUseCase;
  }

  static getGetResultadoseBiomasUseCase(): GetResultadoseBiomasUseCase {
    if (!this.getResultadoseBiomasUseCase) {
      this.getResultadoseBiomasUseCase = new GetResultadoseBiomasUseCase(this.geteBiomasRepository());
    }
    return this.getResultadoseBiomasUseCase;
  }

  static getPrevieweBiomasUseCase(): PrevieweBiomasUseCase {
    if (!this.previeweBiomasUseCase) {
      this.previeweBiomasUseCase = new PrevieweBiomasUseCase(this.geteBiomasRepository());
    }
    return this.previeweBiomasUseCase;
  }

  // ePirólisis (Etapa 2)
  static getEPirolisisRepository(): IEPirolisisRepository {
    if (!this.ePirolisisRepository) {
      this.ePirolisisRepository = new EPirolisisAirtableRepository();
    }
    return this.ePirolisisRepository;
  }

  static getCalcularEPirolisisUseCase(): CalcularEPirolisisUseCase {
    if (!this.calcularEPirolisisUseCase) {
      this.calcularEPirolisisUseCase = new CalcularEPirolisisUseCase(this.getEPirolisisRepository());
    }
    return this.calcularEPirolisisUseCase;
  }

  static getGetResultadosEPirolisisUseCase(): GetResultadosEPirolisisUseCase {
    if (!this.getResultadosEPirolisisUseCase) {
      this.getResultadosEPirolisisUseCase = new GetResultadosEPirolisisUseCase(this.getEPirolisisRepository());
    }
    return this.getResultadosEPirolisisUseCase;
  }

  static getPreviewEPirolisisUseCase(): PreviewEPirolisisUseCase {
    if (!this.previewEPirolisisUseCase) {
      this.previewEPirolisisUseCase = new PreviewEPirolisisUseCase(this.getEPirolisisRepository());
    }
    return this.previewEPirolisisUseCase;
  }

  // eTransporte (Etapa 3)
  static getETransporteRepository(): IETransporteRepository {
    if (!this.eTransporteRepository) {
      this.eTransporteRepository = new ETransporteAirtableRepository();
    }
    return this.eTransporteRepository;
  }

  static getCalcularETransporteUseCase(): CalcularETransporteUseCase {
    if (!this.calcularETransporteUseCase) {
      this.calcularETransporteUseCase = new CalcularETransporteUseCase(this.getETransporteRepository());
    }
    return this.calcularETransporteUseCase;
  }

  static getGetResultadosETransporteUseCase(): GetResultadosETransporteUseCase {
    if (!this.getResultadosETransporteUseCase) {
      this.getResultadosETransporteUseCase = new GetResultadosETransporteUseCase(this.getETransporteRepository());
    }
    return this.getResultadosETransporteUseCase;
  }

  static getPreviewETransporteUseCase(): PreviewETransporteUseCase {
    if (!this.previewETransporteUseCase) {
      this.previewETransporteUseCase = new PreviewETransporteUseCase(this.getETransporteRepository());
    }
    return this.previewETransporteUseCase;
  }

  // eUse (Etapa 4)
  static getEUseRepository(): IEUseRepository {
    if (!this.eUseRepository) {
      this.eUseRepository = new EUseAirtableRepository();
    }
    return this.eUseRepository;
  }

  static getCalcularEUseUseCase(): CalcularEUseUseCase {
    if (!this.calcularEUseUseCase) {
      this.calcularEUseUseCase = new CalcularEUseUseCase(this.getEUseRepository());
    }
    return this.calcularEUseUseCase;
  }

  static getGetResultadosEUseUseCase(): GetResultadosEUseUseCase {
    if (!this.getResultadosEUseUseCase) {
      this.getResultadosEUseUseCase = new GetResultadosEUseUseCase(this.getEUseRepository());
    }
    return this.getResultadosEUseUseCase;
  }

  static getPreviewEUseUseCase(): PreviewEUseUseCase {
    if (!this.previewEUseUseCase) {
      this.previewEUseUseCase = new PreviewEUseUseCase(this.getEUseRepository());
    }
    return this.previewEUseUseCase;
  }

  // Aforos por Turno
  static getAforoRepository(): IAforoRepository {
    if (!this.aforoRepository) {
      this.aforoRepository = new AforoAirtableRepository();
    }
    return this.aforoRepository;
  }

  static getCreateAforoUseCase(): CreateAforoUseCase {
    if (!this.createAforoUseCase) {
      this.createAforoUseCase = new CreateAforoUseCase(this.getAforoRepository());
    }
    return this.createAforoUseCase;
  }

  static getGetAforosByTurnoUseCase(): GetAforosByTurnoUseCase {
    if (!this.getAforosByTurnoUseCase) {
      this.getAforosByTurnoUseCase = new GetAforosByTurnoUseCase(this.getAforoRepository());
    }
    return this.getAforosByTurnoUseCase;
  }

  static getDeleteAforoUseCase(): DeleteAforoUseCase {
    if (!this.deleteAforoUseCase) {
      this.deleteAforoUseCase = new DeleteAforoUseCase(this.getAforoRepository());
    }
    return this.deleteAforoUseCase;
  }

  static getInferirTipoAperturaUseCase(): InferirTipoAperturaUseCase {
    if (!this.inferirTipoAperturaUseCase) {
      this.inferirTipoAperturaUseCase = new InferirTipoAperturaUseCase(this.getAforoRepository());
    }
    return this.inferirTipoAperturaUseCase;
  }

  // Reset para testing
  static reset(): void {
    this.userRepository = null;
    this.authService = null;
    this.eBiomasRepository = null;
    this.calculareBiomasUseCase = null;
    this.getResultadoseBiomasUseCase = null;
    this.previeweBiomasUseCase = null;
    this.ePirolisisRepository = null;
    this.calcularEPirolisisUseCase = null;
    this.getResultadosEPirolisisUseCase = null;
    this.previewEPirolisisUseCase = null;
    this.eTransporteRepository = null;
    this.calcularETransporteUseCase = null;
    this.getResultadosETransporteUseCase = null;
    this.previewETransporteUseCase = null;
    this.eUseRepository = null;
    this.calcularEUseUseCase = null;
    this.getResultadosEUseUseCase = null;
    this.previewEUseUseCase = null;
    this.aforoRepository = null;
    this.createAforoUseCase = null;
    this.getAforosByTurnoUseCase = null;
    this.deleteAforoUseCase = null;
    this.inferirTipoAperturaUseCase = null;
  }
}